// BJ77 性能专项 · Phase 1 普查探针(只读,零 src 触碰)
// 目标:量化世界渲染三块(WaterWaves / compositeLight / liquids)帧耗时占比与走动增量。
// 通道:CPU 主通道(Profiler .cpuprofile)+ 页内 rAF 帧界 + 实例方法归因包裹。
// ★纪律:GPU 页不挂 trace(channels.trace=false);窗内禁确定性 pump;注入全带 swPerfBj77 前缀。
// 运行:node tools/probe.mjs run scripts/_bj77-perf-census.mjs --seed=05162020 --size=small --vite=auto
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front,
  armPerfInstrumentation, installFrameProbe, createPerfRecorder, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await armPerfInstrumentation(page, {});
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  await installFrameProbe(page);

  // ---- 归因包裹(实例方法运行时直调,坑表 G11;try/finally 保原语义)----
  const attr = await page.evaluate(function swPerfBj77Install() {
    const g = window.__swGame;
    const r = g?.renderer;
    if (!g || !r) return { ok: false, why: 'no-renderer' };
    const P = window.__swPerfBj77 = {
      m: {}, env: {},
      reset() { for (const k of Object.keys(this.m)) { this.m[k].n = 0; this.m[k].ms = 0; } },
    };
    const wrap = (obj, name, tag, note) => {
      const orig = obj?.[name];
      if (typeof orig !== 'function') return false;
      obj[name] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { const e = (P.m[tag] ??= { n: 0, ms: 0 }); e.n++; e.ms += performance.now() - t0; if (note) note(a); }
      };
      return true;
    };
    const res = {};
    res.render = wrap(r, 'render', 'render.total');
    res.updateWaterWaves = wrap(r, 'updateWaterWaves', 'waterwaves.update');
    res.drawLiquids = wrap(r, 'drawLiquids', 'liquids.drawLiquids', (a) => { const e = (P.m[a[5] ? 'liquids.bgPass' : 'liquids.fgPass'] ??= { n: 0, ms: 0 }); e.n++; });
    res.compositeLight = wrap(r, 'compositeLight', 'compositeLight.total');
    res.liquidBehind = wrap(r, 'drawLiquidBehindSolidTiles', 'liquids.behindSolid');
    res.warp = wrap(r.waterWarp, 'applyFullScreen', 'warp.applyFullScreen');
    try {
      const wl = r.worldLightLayer();
      if (wl) res.glComposite = wrap(wl, 'composite', 'gl.worldLight.composite');
    } catch { /* GL 层未建 */ }
    try {
      P.env.cpuRender = !!r.isCpuRender();
      P.env.dpr = window.devicePixelRatio;
      P.env.viewW = r.canvas?.width ?? null; P.env.viewH = r.canvas?.height ?? null;
      P.env.glWorld = (() => { const w = r.worldLightLayer?.(); return w ? { unavailable: !!w.unavailable } : null; })();
    } catch { /* 读环抛错不致命 */ }
    return { ok: true, wrapped: res, env: P.env };
  });
  L.chk('attr-wrap', attr.ok, JSON.stringify(attr.wrapped ?? attr));
  L.say('env=' + JSON.stringify(attr.env ?? {}));

  // ---- 找水(地表列扫描,只读)----
  const water = await page.evaluate(function swPerfBj77FindWater() {
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
    const px = g.player.x;
    runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - px) - Math.abs((b[0] + b[1]) / 2 - px));
    return { runs: runs.slice(0, 6), playerX: px, groundLevel: gl, w: st.w, h: st.h };
  });
  L.say('water-runs=' + JSON.stringify(water.runs) + ' playerX=' + water.playerX);

  const rec = createPerfRecorder(page, { outDir: process.env.SW_PROBE_OUT || '/tmp/probe-out/bj77', scenario: 'census', channels: { profile: true, trace: false, metrics: true } });

  // ---- 走动驱动器(真实 rAF;只写玩家位,相机 follow 自缓——同 perf-scenarios 惯例)----
  await page.evaluate(function swPerfBj77WalkInstall() {
    const P = window.__swPerfBj77Walk = { on: false, tps: 0, dir: 1, last: 0 };
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
  const setWalk = (on, tps, dir) => page.evaluate((c) => { const P = window.__swPerfBj77Walk; P.on = c.on; P.tps = c.tps; P.dir = c.dir; P.last = 0; }, { on, tps, dir });

  const seg = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    await page.evaluate(() => { window.__swPerfBj77?.reset(); });
    await rec.startSegment(name, {});
    await sleep(ms);
    const s = await rec.endSegment();
    const a = await page.evaluate(() => {
      const P = window.__swPerfBj77;
      return { m: P.m };
    });
    let waveInfo = { err: 'skip' };
    try {
      waveInfo = await page.evaluate(async () => {
        const { waterWaves } = await import('/src/render/WaterWaves.ts');   // 单例裸 import(禁 ?t=)
        const r = window.__swGame.renderer;
        const d = waterWaves.debug();
        return { q: waterWaves.quality, gridW: waterWaves.gridW(), gridH: waterWaves.gridH(), steps: d.stepsLastFrame, liquidInView: r._waveLiquidInView };
      });
    } catch (e) { waveInfo = { err: String(e).slice(0, 120) }; }
    const rows = Object.entries(a?.m ?? {}).map(([k, v]) => `${k}: n=${v.n} total=${v.ms.toFixed(1)}ms avg=${v.n ? (v.ms / v.n).toFixed(3) : '-'}ms`);
    L.say(`[${name}] fps.mean=${s?.fps?.mean} p95=${s?.fps?.p95}ms low1=${s?.fps?.low1} max=${s?.fps?.max}ms frames=${s?.fps?.frames} wave=${JSON.stringify(waveInfo)}`);
    for (const r0 of rows) L.say('  attr ' + r0);
    for (const t of (s?.profile?.funcs ?? []).slice(0, 14)) L.say(`  hot ${t.selfPct}% ${t.fn} ${t.url}:${t.line}`);
    return s;
  };

  // ① 静立地表(基线:chunk 全热、无走动增量)
  await seg('still:surface', 6000);

  // ② 地表走动(12 tile/s 向右)
  await seg('walk:surface', 8000, () => setWalk(true, 12, 1));
  await setWalk(false, 0, 1);

  // ③ 水边静立 + 水边走动(液体+波场+全屏扭曲全链)
  if (water.runs.length) {
    const [wx0, wx1] = water.runs[0];
    const wx = ((wx0 + wx1) / 2) * 16;
    await teleport(page, wx, water.groundLevel * 16 - 48);
    await seg('still:water', 6000);
    await seg('walk:water', 8000, () => setWalk(true, 12, 1));
    await setWalk(false, 0, 1);
  } else {
    L.say('no-water-run: 水段跳过(本种子小世界无可视地表水体)');
  }

  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

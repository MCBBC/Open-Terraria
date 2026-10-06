// ★入场窗逐秒分解探针（2026-10-06,「进世界后长时间无法稳定帧率」定谳面）。
//  进世界后 60s 逐秒采样:帧距分布 + 各系统消耗分解:
//   · chunk bake（ChunkCache.renderChunk 计数与耗时 + beginBakeBudget 上一帧账）
//   · TileShine bake（shineStats 增量:bakes/bakeMs/resumes/pending…）
//   · 光照（Game.tickLighting 计数与耗时 + endEntryFreeze 掀幕时刻）
//   · 纹理上传（texImage2D/texSubImage2D 计数+估像素）
//   · minimap（Minimap.flushDirty 计数与耗时）
//   · worker 分派压力（document-start 包 Worker:按 URL 计 postMessage）
//   · longtask（PerformanceObserver;未被具名系统归因的卡顿=GC/杂项证据面）
//  输出:RESULT_JSON（Node 侧再聚合）+ 页内 200ms 快照序列（覆盖门/等待账/fps）。
//  运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_entry-window-diag.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5221';
const SEED = process.env.SW_DIAG_SEED ?? 'entrydiag';
const SAMPLE_S = Number(process.env.SW_DIAG_SECONDS ?? '60');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  // 插桩中立性:禁后台化（遮挡 headed 窗触发 rAF 节流脉冲=伪族源,b2final 同款）
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

// document-start:Worker 分派压力计数 + longtask 观察器（boot 期 worker 也捕获）
await page.evaluateOnNewDocument(() => {
  const W = (window.__swInstDS = { posts: {}, workers: [], longtasks: [] });
  const OrigWorker = window.Worker;
  window.Worker = function (url, opts) {
    const u = String(url);
    const tag = /bake/i.test(u) ? 'bake' : /light/i.test(u) ? 'light' : /wave/i.test(u) ? 'wave'
      : /save/i.test(u) ? 'save' : /worldGen|worldgen/i.test(u) ? 'worldgen' : /pump/i.test(u) ? 'pump' : 'other';
    const w = new OrigWorker(url, opts);
    W.workers.push({ tag, url: u.slice(0, 120) });
    const origPost = w.postMessage.bind(w);
    w.postMessage = (...a) => { W.posts[tag] = (W.posts[tag] ?? 0) + 1; return origPost(...a); };
    return w;
  };
  window.Worker.prototype = OrigWorker.prototype;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (W.longtasks.length < 5000) W.longtasks.push({ s: e.startTime, d: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* */ }
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
log('menu ready — installing hooks');

await page.evaluate(() => {
  const ctxTag = window.__swInst && window.__swInst.__ctx === performance.timeOrigin;
  const W = ctxTag ? window.__swInst : (window.__swInst = { __ctx: performance.timeOrigin, posts: {}, workers: [], longtasks: [] });
  W.renderT = []; W.obsT = []; W.marks = [];
  W.bake = { n: 0, ms: 0 };            // renderChunk
  W.bakeEvents = [];                   // [t, ms] 时间戳化（逐秒归因）
  W.flush = { n: 0, ms: 0, disp: 0 };  // ChunkCache.flushDirty
  W.budgetSpent = [];                  // 每渲染帧上一帧烘焙账（beginBakeBudget 前 _bakeSpent）
  W.light = { n: 0, ms: 0 };           // Game.tickLighting
  W.lightEvents = [];                  // [t, ms]
  W.mm = { n: 0, ms: 0 };              // Minimap.flushDirty
  W.mmEvents = [];                     // [t, ms]
  W.tex = { n: 0, px: 0, sub_n: 0, sub_px: 0 }; // WebGL 上传
  W.texEvents = [];                    // {t, sub, px}
  W.freezeAt = { begin: [], end: [] }; // 掀幕时刻（endEntryFreeze=幕布撤除同帧链）
  W.samples = [];                      // 200ms 快照
  W.gaps = [];                         // (t, gap) 大帧距明细 >25ms
  W.err = [];

  const wrapMs = (obj, name, acc, events) => {
    const orig = obj[name];
    if (typeof orig !== 'function') { W.err.push('no-fn:' + name); return; }
    obj[name] = function (...a) {
      const t0 = performance.now();
      try { return orig.apply(this, a); }
      finally {
        const dt = performance.now() - t0;
        acc.n++; acc.ms += dt;
        if (events && events.length < 40000) events.push({ t: t0, ms: dt });
      }
    };
  };

  (async () => {
    try {
      // 1) FrameBeat:渲染帧边界（帧距权威面）
      const { FrameBeat } = await import('/src/core/FrameBeat.ts');
      const bp = FrameBeat.prototype;
      const oObs = bp.observeVsync, oBeg = bp.beginRender;
      bp.observeVsync = function (now, cap) { if (W.obsT.length < 200000) W.obsT.push(now); return oObs.call(this, now, cap); };
      bp.beginRender = function (now) {
        if (W.renderT.length < 200000) {
          const arr = W.renderT;
          const prev = arr.length ? arr[arr.length - 1] : null;
          if (prev != null) { const g = now - prev; if (g > 25 && W.gaps.length < 2000) W.gaps.push({ t: now, g }); }
          arr.push(now);
        }
        return oBeg.call(this, now);
      };
      // 2) ChunkCache
      const { ChunkCache } = await import('/src/render/ChunkCache.ts');
      wrapMs(ChunkCache.prototype, 'renderChunk', W.bake, W.bakeEvents);
      const cc = ChunkCache.prototype;
      const oFlush = cc.flushDirty;
      cc.flushDirty = function (...a) {
        const q0 = this.dirtyQueue.length, t0 = performance.now();
        try { return oFlush.apply(this, a); }
        finally { W.flush.n++; W.flush.ms += performance.now() - t0; W.flush.disp += this.lastFlushCount ?? 0; if (q0 > W._maxQ) W._maxQ = q0; }
      };
      const oBB = cc.beginBakeBudget;
      cc.beginBakeBudget = function () { if (typeof this._bakeSpent === 'number' && W.budgetSpent.length < 200000) W.budgetSpent.push(this._bakeSpent); return oBB.call(this); };
      // 3) Game:tickLighting + 掀幕时刻
      const { Game } = await import('/src/core/Game.ts');
      wrapMs(Game.prototype, 'tickLighting', W.light, W.lightEvents);
      const oEnd = Game.prototype.endEntryFreeze;
      Game.prototype.endEntryFreeze = function (...a) { W.freezeAt.end.push(performance.now()); return oEnd.apply(this, a); };
      const oBeg2 = Game.prototype.beginEntryFreeze;
      Game.prototype.beginEntryFreeze = function (...a) { W.freezeAt.begin.push(performance.now()); return oBeg2.apply(this, a); };
      // 4) Minimap.flushDirty
      const { Minimap } = await import('/src/render/Renderer.ts');
      wrapMs(Minimap.prototype, 'flushDirty', W.mm, W.mmEvents);
      // 5) WebGL 纹理上传计数
      for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
        if (!C) continue;
        for (const m of ['texImage2D', 'texSubImage2D']) {
          const orig = C.prototype[m];
          if (typeof orig !== 'function') continue;
          C.prototype[m] = function (...a) {
            const sub = m === 'texSubImage2D';
            // 数值宽高仅在全数值重载（≥8 参）可信——6 参 DOM 源重载 a[3]/a[4]=format/type 会误乘
            const okNum = a.length >= 8 && typeof a[sub ? 4 : 3] === 'number' && typeof a[sub ? 5 : 4] === 'number';
            const w = a[sub ? 4 : 3], h = a[sub ? 5 : 4];
            const px = okNum ? w * h : 0;
            if (sub) { W.tex.sub_n++; W.tex.sub_px += px; }
            else { W.tex.n++; W.tex.px += px; }
            if (W.texEvents.length < 40000) W.texEvents.push({ t: performance.now(), sub, px });
            return orig.apply(this, a);
          };
        }
      }
      W.hooked = true;
    } catch (e) { W.err.push(String(e && e.message || e)); }
  })();

  // 200ms 快照泵（页内,免协议往返抖动）
  W._poll = setInterval(() => {
    try {
      const g = window.__swGame;
      if (!g || !g.world) { W.samples.push({ t: performance.now(), phase: 'pre' }); return; }
      const cc = g.chunks;
      const sh = window.__swShine;
      W.samples.push({
        t: performance.now(),
        ef: g.entryFreezeActive === true,
        cov: cc ? cc.viewportCovered() : null,
        wA: cc ? cc.workerAwaiting.size : -1,
        bA: cc ? cc.budgetAwaiting.size : -1,
        dq: cc ? cc.dirtyQueue.length : -1,
        fps: g.fps,
        pend: sh ? sh.pending : null,
        shBakes: sh ? sh.bakes : null,
        shMs: sh ? Math.round(sh.bakeMs * 10) / 10 : null,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        spent: typeof cc?._bakeSpent === 'number' ? cc._bakeSpent : null,
      });
    } catch (e) { if (W.err.length < 20) W.err.push('poll:' + (e && e.message || e)); }
  }, 200);
});
log('hooks installed (async)');

const mark = (n) => page.evaluate((n) => window.__swInst?.marks.push({ n, t: performance.now() }), n);

// TileShine shineStats 引用入页（快照泵消费）
await page.evaluate(async () => {
  const { shineStats } = await import('/src/render/TileShine.ts');
  window.__swShine = shineStats;
  window.__swCfg = { shineBudgetMs: (await import('/src/render/TileShine.ts')).shineBudgetMs, shineBudgetExplicit: (await import('/src/render/TileShine.ts')).shineBudgetExplicit };
});

// ---- 进世界（b2final 同款 UI 流;固定种子=可复现）----
// 用户态档位（B2 上下文）:cap120 + subtle——先置档再进世界,入场窗即处于该档
const CAP = Number(process.env.SW_DIAG_CAP ?? '120');
await page.evaluate(async (cap) => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', cap);
  await options.set('frameSkipMode', 'subtle');
}, CAP);
log(`frameCap=${CAP} subtle set`);
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('入场窗探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type(SEED);
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await mark('worldgen-begin'); log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 500 });
await mark('inworld'); log('inworld — sampling ' + SAMPLE_S + 's');
const hooked = await page.evaluate(() => ({ hooked: window.__swInst.hooked === true, err: window.__swInst.err }));
console.log('hooks:', JSON.stringify(hooked));

await new Promise((r) => setTimeout(r, SAMPLE_S * 1000));
await mark('done'); log('done');

const out = await page.evaluate(() => {
  const W = window.__swInst;
  const sh = window.__swShine;
  const g = window.__swGame;
  const shine = {};
  for (const k of Object.keys(sh)) if (typeof sh[k] === 'number') shine[k] = sh[k];
  return {
    renderT: W.renderT, obsT: W.obsT, marks: W.marks, gaps: W.gaps,
    bake: W.bake, bakeEvents: W.bakeEvents,
    flush: { ...W.flush, maxQ: W._maxQ ?? 0 }, budgetSpent: W.budgetSpent,
    light: W.light, lightEvents: W.lightEvents, mm: W.mm, mmEvents: W.mmEvents,
    tex: W.tex, texEvents: W.texEvents, freezeAt: W.freezeAt, samples: W.samples,
    longtasks: W.longtasks, posts: W.posts, workers: W.workers, err: W.err, hooked: W.hooked === true,
    shine, cfg: window.__swCfg,
    gameCfg: g ? { fps: g.fps, frameCap: window.__swCfg?.frameCap } : null,
    bakeBudgetMs: g?.chunks?.bakeBudgetMs ?? null,
    bakeClientAlive: g?.chunks?.bakeClient != null,
    lightWorkerAlive: !!(g?.lighting && (g.lighting.lw || g.lighting.worker || g.lighting._lw)),
    worldDims: g ? { w: g.world.w, h: g.world.h } : null,
  };
});
console.log('RESULT_JSON_START');
console.log(JSON.stringify(out));
console.log('RESULT_JSON_END');

// ---- Node 侧逐秒聚合 ----
const R = out;
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : NaN;
const M = Object.fromEntries(R.marks.map(m => [m.n, m.t]));
// shine 累计→逐秒差分（samples 200ms 快照带 shBakes/shMs）
const shineDeltaSec = (s, a, b) => {
  const inWin = R.samples.filter(x => x.t >= a && x.t < b && x.shBakes != null);
  if (inWin.length < 2) return { bakes: 0, ms: 0 };
  const first = inWin[0], last = inWin[inWin.length - 1];
  return { bakes: last.shBakes - first.shBakes, ms: last.shMs - first.shMs };
};
if (R.renderT?.length) {
  const inT0 = M['inworld'];
  const rel = R.renderT.filter(t => t >= inT0);
  console.log(`\n=== 入场窗逐秒分解（inworld 起 ${SAMPLE_S}s;seed=${SEED} cap=${CAP} subtle）===`);
  console.log('sec  n   p50    p95    p99   max  >13 | bake# bakeMs lightMs shineMs tex#  mmMs ltMs heap');
  const perSec = [];
  let texPrev = { n: R.tex.n, sub: R.tex.sub_n };
  for (let s = 0; s < SAMPLE_S; s++) {
    const a = inT0 + s * 1000, b = a + 1000;
    const fr = rel.filter(t => t >= a && t < b);
    const gaps = [];
    for (let i = 1; i < fr.length; i++) gaps.push(fr[i] - fr[i - 1]);
    const gs = [...gaps].sort((x, y) => x - y);
    const inWin = (ev) => ev.filter(e => e.t >= a && e.t < b);
    const bakeMs = inWin(R.bakeEvents).reduce((v, e) => v + e.ms, 0);
    const bakeN = inWin(R.bakeEvents).length;
    const lightMs = inWin(R.lightEvents).reduce((v, e) => v + e.ms, 0);
    const mmMs = inWin(R.mmEvents).reduce((v, e) => v + e.ms, 0);
    const sh = shineDeltaSec(s, a, b);
    const texN = inWin(R.texEvents).length;
    const ltMs = R.longtasks.filter(e => e.s >= a && e.s < b).reduce((v, e) => v + e.d, 0);
    const heapS = R.samples.filter(x => x.t >= a && x.t < b && x.heap != null);
    const heap = heapS.length ? heapS[heapS.length - 1].heap : null;
    const row = {
      s, n: fr.length, p50: q(gs, .5), p95: q(gs, .95), p99: q(gs, .99), max: gs[gs.length - 1] ?? 0,
      gt13: gaps.filter(g => g > 13).length,
    };
    perSec.push(row);
    console.log(`${String(s).padStart(2)}  ${String(row.n).padStart(3)} ${(row.p50 ?? 0).toFixed(1).padStart(6)} ${(row.p95 ?? 0).toFixed(1).padStart(6)} ${(row.p99 ?? 0).toFixed(1).padStart(6)} ${(row.max ?? 0).toFixed(0).padStart(5)} ${String(row.gt13).padStart(4)} | ${String(bakeN).padStart(5)} ${bakeMs.toFixed(0).padStart(6)} ${lightMs.toFixed(0).padStart(7)} ${sh.ms.toFixed(1).padStart(7)} ${String(texN).padStart(4)} ${mmMs.toFixed(1).padStart(5)} ${ltMs.toFixed(0).padStart(4)} ${heap ?? '-'}`);
  }
  // 不稳窗量化:持续 5s p95<12.5
  let stableFrom = -1;
  for (let i = 0; i + 5 <= perSec.length; i++) {
    let ok = true;
    for (let j = i; j < i + 5; j++) if (!(perSec[j].p95 < 12.5)) { ok = false; break; }
    if (ok) { stableFrom = i; break; }
  }
  console.log(`\n持续5s p95<12.5 首达秒: ${stableFrom < 0 ? '未达' : stableFrom + 's'}`);
  const allGaps = [];
  for (let i = 1; i < rel.length; i++) allGaps.push(rel[i] - rel[i - 1]);
  const ags = [...allGaps].sort((x, y) => x - y);
  console.log(`全程: n=${allGaps.length} p50=${q(ags, .5).toFixed(2)} p95=${q(ags, .95).toFixed(2)} p99=${q(ags, .99).toFixed(2)} max=${ags[ags.length - 1]?.toFixed(1)}`);
  if (R.freezeAt?.end?.length) console.log(`endEntryFreeze(掀幕) 时刻: ${R.freezeAt.end.map(t => '+' + (t - M['inworld']).toFixed(0) + 'ms').join(', ')}`);
  if (R.freezeAt?.begin?.length) console.log(`beginEntryFreeze 时刻: ${R.freezeAt.begin.map(t => '+' + (t - M['inworld']).toFixed(0) + 'ms').join(', ')}`);
  // 大帧距明细(前 25 条)
  if (R.gaps?.length) {
    console.log(`\n>25ms 帧距明细(前 25,inworld 相对秒):`);
    for (const g of R.gaps.slice(0, 25)) console.log(`  +${((g.t - M['inworld']) / 1000).toFixed(2)}s  ${g.g.toFixed(0)}ms`);
  }
  // 预算饱和面
  if (R.budgetSpent?.length) {
    const bs = R.budgetSpent;
    const sat = bs.filter(v => v >= 7.5).length;
    console.log(`\n帧内烘焙预算账: 帧=${bs.length} 饱和帧(≥7.5ms)=${sat} (${(100 * sat / bs.length).toFixed(1)}%)`);
  }
  console.log(`\n系统累计(inworld 后): bake=${R.bake.n}次/${R.bake.ms.toFixed(0)}ms  flush=${R.flush.n}次/${R.flush.ms.toFixed(0)}ms(派发${R.flush.disp})  light=${R.light.n}次/${R.light.ms.toFixed(0)}ms  mm=${R.mm.n}次/${R.mm.ms.toFixed(0)}ms  tex=${R.tex.n}+${R.tex.sub_n}次 px=${(R.tex.px / 1e6).toFixed(1)}M+${(R.tex.sub_px / 1e6).toFixed(1)}M`);
  console.log(`shine 增量: ${JSON.stringify(R.shine)}`);
  console.log(`worker posts: ${JSON.stringify(R.posts)}  workers=${JSON.stringify(R.workers)}`);
  console.log(`cfg: bakeBudgetMs=${R.bakeBudgetMs} bakeClient=${R.bakeClientAlive} lightWorker=${R.lightWorkerAlive} shineCfg=${JSON.stringify(R.cfg)} world=${JSON.stringify(R.worldDims)} hooked=${R.hooked}`);
  if (R.err?.length) console.log('inst err:', R.err.slice(0, 5));
}
await browser.close();
process.exit(0);

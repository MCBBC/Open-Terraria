// ★perf2 光照引擎热点计量(2026-09-19)——runFullCycle 逐段打点 + 逐帧光照图哈希对账。
// trace 证据:LightingEngine runFullCycle 8.6s/49.9s(17%,~12.7ms/帧):
//   processScan 4.7s(exportTo 3.1s 播种+getMask 0.33s)+processBlurAndPresent 3.9s
//   (LightMap blurLine 3.7s 可分离盒模糊)。本探针:
//   ① 地表+洞穴各 600 帧强制 dirty=每帧全量 runFullCycle(与 trace 同相);
//   ② 归因三层:粗段 timed-wrap(scan/blurPresent/exportTo/blur,调用率≤1/帧,
//      高于 performance.now 量化噪声)+ 热小函数计数 wrap(getMask/blurLine)+
//      V8 CPU profile 自时间聚合(200 帧)+ 存活对象上 micro-bench(存原函数引用,
//      N 次循环 > 量化窗);
//   ③ 逐帧 FNV 哈希(r/g/b 区域面)→ /tmp/perf2-lighting/<tag>/<scene>.json,
//      修前/修后位等价对账(修码前后各跑一次,hash 序列须逐帧全等);
//   ④ 确定性钉:pinRandom(createGame)+ 钟面冻结 + globalTimeWrappedHourly 实例覆写
//      + LightMap 双图种子钉死 + flicker 字段回初值 + heldLight/buffLights 清空
//      + 游戏循环停机(g.running=false,探针直驱 compute);
//   ⑤ 截图(+页内 64 bin 亮度直方图)供修前/修后对拍。
// 用法:SW_ORIGIN=http://localhost:5275 RUN_TAG=before node tools/run-diag.mjs
//      --timeout=420000 scripts/_perf2-lighting.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, teleport, front, ledger } from '../tools/probe/lib/index.mjs';

const TAG = process.env.RUN_TAG || 'run';
const FRAMES = +(process.env.FRAMES || 600);
const PROFILE_FRAMES = +(process.env.PROFILE_FRAMES || 200);
const WARMUP = 60;
const SCENES = (process.env.SCENES || 'surface,cave').split(',');
const OUT_DIR = '/tmp/perf2-lighting';
const L = ledger();
mkdirSync(join(OUT_DIR, TAG), { recursive: true });

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await bootstrap(page, process.env.SW_ORIGIN);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260903 });
  L.chk('world-built', gen.ok, `seed=${gen.seed} ${gen.w}x${gen.h}`);

  for (const scene of SCENES) {
    const sceneName = scene.trim();
    // ---- 场景坐标(确定性搜索;同种子同世界 → 两轮全等) ----
    const spot = await page.evaluate((sc) => {
      const g = window.__swGame;
      const st = g.world.store;
      const gl = g.world.groundLevel;
      const solidAt = (x, y) => st.flags[st.idx(x, y)] !== 0 && st.slope[st.idx(x, y)] === 0
        && st.type[st.idx(x, y)] !== 0;
      if (sc === 'surface') {
        const tx = st.w >> 1;
        let ty = -1;
        for (let y = 8; y < gl + 12; y++) { if (solidAt(tx, y)) { ty = y; break; } }
        if (ty < 0) return { ok: false, why: 'no-ground' };
        return { ok: true, wx: tx * 16, wy: (ty - 3) * 16 };
      }
      // cave:中心向右扫,gl+50..gl+160 找 5×3 空气口袋(取口袋中心)
      for (let x = (st.w >> 1); x < st.w - 20; x++) {
        for (let y = gl + 50; y < Math.min(gl + 160, st.h - 8); y++) {
          let air = true;
          for (let dx = 0; dx < 5 && air; dx++) for (let dy = 0; dy < 3 && air; dy++) {
            const i = st.idx(x + dx, y + dy);
            if (st.flags[i] !== 0 && st.type[i] !== 0) air = false;
          }
          if (air) return { ok: true, wx: (x + 2) * 16, wy: (y + 1) * 16 };
        }
      }
      return { ok: false, why: 'no-cave' };
    }, sceneName);
    L.chk(`spot:${sceneName}`, spot.ok, JSON.stringify(spot));
    if (!spot.ok) continue;
    await teleport(page, spot.wx, spot.wy);

    // ---- 确定性钉 + 仪表(停机直驱) ----
    await page.evaluate(async ({ frames, warmup, profileFrames }) => {
      const g = window.__swGame;
      const TILE = 16;
      // ① 停渲染循环(探针直驱 lighting.compute;世界静止=输入恒定)
      g.running = false;
      // ② 钟面冻结+钉值(world.clock.tick 动态分派点)
      const w = g.world;
      w.clock.tick = () => {};
      w.clock.timeOfDay = 0.85;          // 夜(天空播种量非平凡)
      // ③ FlickerClock 回初值 + wall-clock 派生量钉死(实例自有属性遮蔽原型 getter)
      const F = g.lighting.clock;
      F.mouseTextColor = 255; F.mouseDir = -1;
      F.cursorAlpha = 1; F.cursorDir = -1;
      F.demonTorch = 0; F.demonDir = 1;
      F.discoR = 255; F.discoG = 0; F.discoB = 0; F.discoStyle = 0;
      F.essScale = 1; F.essDir = -1;
      F.masterColor = 1; F.masterColorDir = 1;
      F.timeForVisualEffects = 0;
      F.jellyMode?.fill?.(0); F.jellyCounter?.fill?.(0); F.jellyFrame?.fill?.(0);
      Object.defineProperty(F, 'globalTimeWrappedHourly', { value: 123.456, configurable: true });
      // ④ LightMap 双图随机种子钉死(构造期 Math.random 派生 → 跨轮不稳定)
      const FR = (await import('/src/lighting/FastRandom.ts')).FastRandom;
      const li = g.lighting;
      li.work.random = new FR(424242);
      li.active.random = new FR(424243);
      li.heldLight = null; li.buffLights = []; li.liquidDirty = false;
      // ⑤ 区域与 Game.ts:10940 同式(zoom 钉 1)
      g.camera.zoom = 1; g.camera.zoomTarget = 1;
      const viewTW = Math.ceil(g.camera.viewW / g.camera.zoom / TILE) + 2;
      const viewTH = Math.ceil(g.camera.viewH / g.camera.zoom / TILE) + 2;
      li.ensureRegion(g.player.cx, g.player.cy, viewTW, viewTH);
      const region = { rx: li.rx, ry: li.ry, rw: li.rw, rh: li.rh };
      window.__swLightRegion = region;
      // ⑥ 包裹归因:粗段 timed(调用率低);热小函数只计数(performance.now 量化会淹没)
      const LE = (await import('/src/lighting/LightingEngine.ts')).LightingEngine;
      const TS = (await import('/src/lighting/TileLightScanner.ts')).TileLightScanner;
      const LM = (await import('/src/lighting/LightMap.ts')).LightMap;
      const P = { seg: {}, cnt: {}, orig: {} };
      window.__swLightDebugP = P;
      const timed = (cls, name, tag) => {
        const orig = cls.prototype[name];
        if (typeof orig !== 'function') throw new Error(`no-proto:${name}`);
        P.orig[tag] = orig;
        cls.prototype[name] = function (...a) {
          const t0 = performance.now();
          try { return orig.apply(this, a); }
          finally { const e = P.seg[tag] ??= { n: 0, ms: 0 }; e.n++; e.ms += performance.now() - t0; }
        };
      };
      const counted = (cls, name, tag) => {
        const orig = cls.prototype[name];
        if (typeof orig !== 'function') throw new Error(`no-proto:${name}`);
        P.orig[tag] = orig;
        cls.prototype[name] = function (...a) {
          P.cnt[tag] = (P.cnt[tag] ?? 0) + 1;
          return orig.apply(this, a);
        };
      };
      timed(LE, 'processScan', 'scan.total');
      timed(LE, 'processBlurAndPresent', 'blurPresent.total');
      timed(TS, 'exportTo', 'exportTo');
      timed(LM, 'blur', 'blur');
      counted(TS, 'getMask', 'getMask');
      counted(LM, 'blurLine', 'blurLine');
      counted(LM, 'buildWaterFlick', 'waterFlick');
      // ⑦ FNV-1a 32bit
      const fnv = (arr) => {
        let x = 0x811c9dc5 | 0;
        for (let k = 0; k < arr.length; k++) { x ^= arr[k]; x = Math.imul(x, 0x01000193); }
        return (x >>> 0).toString(16).padStart(8, '0');
      };
      // ⑧ 主计量(600 帧;预热吸收停机前残留 perFrame 灯与 JIT)
      window.__swLightRun = async () => {
        for (let i = 0; i < warmup; i++) { li.dirty = true; li.compute(0); }
        P.seg = {}; P.cnt = {};
        const tAll = [];
        const hashes = [];
        for (let f = 0; f < frames; f++) {
          const t0 = performance.now();
          li.dirty = true;
          li.compute(0);
          tAll.push(performance.now() - t0);
          hashes.push(fnv(li.r) + fnv(li.g) + fnv(li.b));
          if ((f & 31) === 31) await new Promise((r) => setTimeout(r, 0));
        }
        const sorted = [...tAll].sort((a, b) => a - b);
        const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
        const mean = tAll.reduce((s, v) => s + v, 0) / tAll.length;
        const seg = {};
        for (const [k, v] of Object.entries(P.seg)) seg[k] = { n: v.n, mean: v.ms / Math.max(1, v.n), total: v.ms };
        seg['present.export'] = {
          n: (P.seg['blurPresent.total']?.n ?? 0),
          mean: ((P.seg['blurPresent.total']?.ms ?? 0) - (P.seg['blur']?.ms ?? 0)) / Math.max(1, P.seg['blurPresent.total']?.n ?? 1),
          total: (P.seg['blurPresent.total']?.ms ?? 0) - (P.seg['blur']?.ms ?? 0),
        };
        return { mean, p50: q(0.5), p95: q(0.95), max: sorted[sorted.length - 1], seg, counts: P.cnt, hashes };
      };
      // ⑨ micro-bench(存原函数引用直调,避免 wrap 噪声;主计量后跑,不污染哈希)
      window.__swLightBench = () => {
        const st = g.world.store;
        const sc = li.scanner, work = li.work;
        const pad = work.nonVisiblePadding;
        const out = {};
        const bench = (label, n, fn) => {
          for (let i = 0; i < Math.min(n, 64); i++) fn(i);           // 预热
          const t0 = performance.now();
          for (let i = 0; i < n; i++) fn(i);
          const dt = performance.now() - t0;
          out[label] = { n, totalMs: dt, perCallUs: (dt * 1000) / n };
        };
        // getMask:区域前 4096 格 × 64 圈
        const idxs = new Int32Array(4096);
        for (let k = 0; k < 4096; k++) idxs[k] = st.idx(Math.min(st.w - 1, region.rx + (k % region.rw)), Math.min(st.h - 1, region.ry + ((k / region.rw) | 0)));
        bench('getMask', 64 * 4096, (i) => { P.orig.getMask.call(sc, st, idxs[i & 4095]); });
        // blurLine:行(连续内存)/列(跨行 stride)各量——签名自适应(2026-09-19 起
        // stride 形态 (i0,stride,count),旧 (x0,y0,x1,y1,dir);格数恒 w-pad/h-pad 对齐)
        const blNew = P.orig.blurLine.length === 3;
        bench('blurLineRow', 3000, blNew
          ? () => { P.orig.blurLine.call(work, 0, 1, work.w - pad); }
          : () => { P.orig.blurLine.call(work, 0, 0, work.w - 1 - pad, 0, 1); });
        bench('blurLineCol', 3000, blNew
          ? () => { P.orig.blurLine.call(work, 0, work.w, work.h - pad); }
          : () => { P.orig.blurLine.call(work, 0, 0, 0, work.h - 1 - pad, 1); });
        bench('buildWaterFlick', 400, () => { P.orig.waterFlick.call(work); });
        bench('blur', 40, () => { P.orig.blur.call(work); });
        return out;
      };
    }, { frames: FRAMES, warmup: WARMUP, profileFrames: PROFILE_FRAMES });
    const region = await page.evaluate(() => window.__swLightRegion || null);
    L.say(`[${sceneName}] region=${JSON.stringify(region)}`);

    // ---- CPU profile 窗(200 帧;JIT 预热后) ----
    const client = await page.createCDPSession();
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 100 });
    await client.send('Profiler.start');
    await page.evaluate(async ({ frames }) => {
      const li = window.__swGame.lighting;
      for (let f = 0; f < frames; f++) {
        li.dirty = true; li.compute(0);
        if ((f & 15) === 15) await new Promise((r) => setTimeout(r, 0));
      }
    }, { frames: PROFILE_FRAMES });
    const { profile } = await client.send('Profiler.stop');
    await client.detach().catch(() => {});
    // 自时间聚合(µs)
    const self = new Map();
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = (profile.timeDeltas || []);
    let totalUs = 0;
    for (let k = 0; k < dt.length; k++) {
      const node = nodes.get(profile.samples[k]);
      if (!node) continue;
      totalUs += dt[k];
      const fn = node.callFrame.functionName || '(anonymous)';
      const url = (node.callFrame.url || '').replace(/^.*\//, '');
      const key = `${fn} @${url}:${node.callFrame.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + dt[k]);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
      .map(([k, v]) => ({ fn: k, selfMsPerFrame: +(v / 1000 / PROFILE_FRAMES).toFixed(3), pct: +(100 * v / totalUs).toFixed(1) }));

    const res = await page.evaluate(() => window.__swLightRun());
    L.say(`[dbg] orig=${JSON.stringify(await page.evaluate(() => Object.keys(window.__swLightDebugP?.orig ?? {})))}`);
    const bench = await page.evaluate(() => window.__swLightBench());
    const stats = { region, frames: FRAMES, mean: res.mean, p50: res.p50, p95: res.p95, max: res.max, seg: res.seg, counts: res.counts, bench, cpuTop: top, hashes: res.hashes };
    writeFileSync(join(OUT_DIR, TAG, `${sceneName}.json`), JSON.stringify(stats));
    L.say(`[${TAG}/${sceneName}] runFullCycle mean=${res.mean.toFixed(3)}ms p50=${res.p50.toFixed(3)} p95=${res.p95.toFixed(3)} max=${res.max.toFixed(1)}ms`);
    for (const [k, v] of Object.entries(res.seg)) L.say(`    ${k}: n=${v.n} mean=${v.mean.toFixed(4)}ms total=${v.total.toFixed(1)}ms`);
    for (const [k, v] of Object.entries(res.counts)) L.say(`    cnt ${k}: ${v} (${(v / FRAMES).toFixed(0)}/frame)`);
    for (const [k, v] of Object.entries(bench)) L.say(`    bench ${k}: ${v.perCallUs.toFixed(2)}µs/call (n=${v.n})`);
    for (const t of top.slice(0, 12)) L.say(`    cpu ${t.pct}% ${t.selfMsPerFrame}ms/f ${t.fn}`);

    // ---- 截图 + 页内直方图(恢复循环渲染 ~0.8s 后拍) ----
    await page.evaluate(() => { const g = window.__swGame; if (!g.running) { g.running = true; g.lastTime = performance.now(); g.start(); } });
    await front(page);
    await new Promise((r) => setTimeout(r, 800));
    const shot = await page.screenshot({ type: 'png' });
    const shotPath = join('/tmp', sceneName === 'surface' ? 'perf2-lighting' : `perf2-lighting-${sceneName}`) + (TAG === 'after' ? '.png' : `-${TAG}.png`);
    writeFileSync(shotPath, shot);
    const b64 = shot.toString('base64');
    const hist = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const bins = new Array(64).fill(0);
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        bins[Math.min(63, y >> 2)]++; sum += y;
      }
      return { bins, meanLuma: sum / (d.length / 4), w: cv.width, h: cv.height };
    }, b64);
    writeFileSync(join(OUT_DIR, TAG, `${sceneName}.screenshot.json`), JSON.stringify({ path: shotPath, ...hist }));
    L.say(`[${TAG}/${sceneName}] screenshot=${shotPath} meanLuma=${hist.meanLuma.toFixed(2)}`);
  }
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

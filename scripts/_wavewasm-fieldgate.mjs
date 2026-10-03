// ★WASM 第三刀(水波推进核)离线场值闸+活机探针(2026-10-03;sm2wasm-fieldgate 同款方法论)。
// 四段:
//  A) 页面域位级 A/B:WaterWaveSystem 双实例(旗关/开)同种子同帧序 → 写场 Uint32
//     逐位(含 ±0 记号)+ WASM 双跑确定性 + 回退/拒面 + 1080p 计时(JS vs WASM)。
//  B) worker 域对拍:双 WaveWorker(name='sw-wavewasm=1' vs 无旗)同帧批(注入批
//     +相机走动+涟漪) → 强制 'full' 场快照逐字节+头字段;page.workers() 直读
//     loader 统计证 WASM 真在 worker 域消费。
//  C) 活机主线程模拟计时前后(?waveworker=0):patch Renderer.prototype.
//     updateWaterWaves 计时,同场景旗关/开各 300 帧 → 前后 ms/帧。
//  D) 活机缺省配置(worker 域)+水面截图目检(?wavewasm=1)。
// 运行:SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs --timeout=280000 scripts/_wavewasm-fieldgate.mjs
import { launchBrowser, openPage, bootstrap, waitForBridge, createGame, teleport,
  freezeClock, saveCanvasShot } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5210';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0], p50: s[Math.floor(a.length / 2)], mean: a.reduce((p, x) => p + x, 0) / a.length, max: s[s.length - 1] };
};
const fmt = (s) => `min=${s.min.toFixed(3)}/p50=${s.p50.toFixed(3)}/mean=${s.mean.toFixed(3)}/max=${s.max.toFixed(3)}`;

const browser = await launchBrowser({ viewport: { width: 1920, height: 1080 } });
try {
  // ================= A+B:页面域场值闸 =================
  {
    const page = await openPage(browser, {});
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
    // ★带旗导航纪律:查询串必须走完整 URL 直航(gotoApp 洗参坑;旗在 import 期快照+调用期双读)
    // ★waveworker=0:timeArm 需主线程真实步进(缺省开时 frame() 走 worker capture=0ms 假象)
    await bootstrap(page, ORIGIN);
    await page.goto(ORIGIN + '/?wavewasm=1&waveworker=0&t=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await waitForBridge(page, { timeout: 120_000 });

    const out = await page.evaluate(async () => {
      const WW = await import('/src/render/WaterWaves.ts');
      const LW = await import('/src/wasm/wavesWasm.ts');
      const okWasm = await LW.ensureWavesWasm();
      if (!okWasm) return { why: 'wasm not ready' };

      // ---- 确定性 LCG 种子(页面域零 Math.random 依赖面) ----
      let st = 0x2f6e2b1;
      const lcg = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
      const mkInst = (w, h, resetSeed) => {
        const s = new WW.WaterWaveSystem();
        s.resetForTest(); s.setQuality(3);
        st = resetSeed;
        const p = s;
        const R = new Float32Array(w * h), G = new Float32Array(w * h);
        for (let i = 0; i < R.length; i++) R[i] = Math.round(lcg() * 256) / 256;
        for (let i = 0; i < G.length; i++) G[i] = Math.round(lcg() * 256) / 256;
        p._gW = w; p._gH = h; p._R = R; p._G = G;
        p._R2 = new Float32Array(w * h).fill(0.5); p._G2 = new Float32Array(w * h).fill(0.5);
        return s;
      };
      const step = (s, dx, dy) => s._step.call(s, dx, dy);
      const cmp = (aR, bR, aG, bG) => {
        let bad = 0, first = -1;
        for (let i = 0; i < aR.length; i++) {
          if (aR[i] !== bR[i] || aG[i] !== bG[i]) { if (first < 0) first = i; bad++; }
        }
        return { bad, first };
      };

      // ---- A1 位级 A/B:256×160 网格,15 步混合序列(静止/走动/斜向/大跳) ----
      const W = 256, H = 160;
      const seq = [[0,0],[0,0],[1,0],[-1,0],[0,0],[2,-3],[-1,1],[60,-40],[0,0],[1,1],[0,0],[-3,0],[0,0],[1,0],[0,0]];
      LW.__setWavesWasmFlagForTest(false);
      const js = mkInst(W, H, 0x51ed270b);
      const jsSeq = [];
      for (const [dx, dy] of seq) { step(js, dx, dy); jsSeq.push([new Float32Array(js.readGridR()), new Float32Array(js.readGridG())]); }
      LW.__setWavesWasmFlagForTest(true);
      const wam = mkInst(W, H, 0x51ed270b);
      const wamSeq = [];
      for (const [dx, dy] of seq) { step(wam, dx, dy); wamSeq.push([new Float32Array(wam.readGridR()), new Float32Array(wam.readGridG())]); }
      let maxBad = 0, firstBad = -1, firstStep = -1;
      for (let k = 0; k < seq.length; k++) {
        const r = cmp(jsSeq[k][0], wamSeq[k][0], jsSeq[k][1], wamSeq[k][1]);
        if (r.bad > maxBad) { maxBad = r.bad; firstBad = r.first; firstStep = k; }
      }
      const bitLock = { maxBad, firstBad, firstStep, n: W * H };

      // ---- A2 WASM 双跑确定性 ----
      const wam2 = mkInst(W, H, 0x51ed270b);
      const runSeq = (s) => { const o = []; for (const [dx, dy] of seq) { step(s, dx, dy); o.push([new Float32Array(s.readGridR()), new Float32Array(s.readGridG())]); } return o; };
      const w1 = runSeq(wam2);
      const wam3 = mkInst(W, H, 0x51ed270b);
      const w2 = runSeq(wam3);
      let detBad = 0;
      for (let k = 0; k < seq.length; k++) {
        const r = cmp(w1[k][0], w2[k][0], w1[k][1], w2[k][1]);
        detBad += r.bad;
      }
      const determinism = { detBad };

      // ---- A3 计时:1080p 网格(480×270) 三口径 × 双臂;批量步均摊(Chrome 无
      //      crossOriginIsolated 时 performance.now 量化 0.1ms,单帧计时无解) ----
      const BASE = { zoom: 1, viewW: 1920, viewH: 1080, tileX: 60, tileY: 40,
        maxTilesX: 8400, maxTilesY: 2400, worldSurface: 300, rockLayer: 900, windAbs: 0.4, rain: 0 };
      const timeArm = (flagOn) => {
        LW.__setWavesWasmFlagForTest(flagOn);
        const s = new WW.WaterWaveSystem();
        s.resetForTest(); s.setQuality(3);
        s.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 60 });
        const p = s;
        for (let i = 0; i < p._R.length; i++) p._R[i] = 0.5 + Math.sin(i * 0.37) * 0.21;
        for (let i = 0; i < p._G.length; i++) p._G[i] = 0.5 + Math.cos(i * 0.11) * 0.2;
        const out = {};
        const BATCH = 30;
        const bench = (label, dt, camMove) => {
          for (let i = 0; i < 15; i++) s.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 60 });
          const t = [];
          for (let b = 0; b < 12; b++) {
            const t0 = performance.now();
            for (let i = 0; i < BATCH; i++) {
              s.frame({ ...BASE, camX: camMove ? 1000 + ((b * BATCH + i) % 200) * 4 : 1000, camY: 500, dt });
            }
            t.push((performance.now() - t0) / BATCH);
          }
          out[label] = t;
        };
        bench('fast', 1 / 60, false);
        bench('twoStep', 1 / 20, false);
        bench('walk', 1 / 60, true);
        return { fast: stat2(out.fast), twoStep: stat2(out.twoStep), walk: stat2(out.walk) };
        function stat2(a) { const x = [...a].sort((u, v) => u - v); return { min: x[0], p50: x[6], mean: a.reduce((q, z) => q + z, 0) / a.length }; }
      };
      const tJs = timeArm(false);
      const tWam = timeArm(true);

      // ---- A4 回退/拒面 ----
      const runsBefore = LW.__wavesWasmStats.runs;
      LW.__setWavesWasmUnavailableForTest(true);
      const sFB = mkInst(64, 48, 0x999);
      step(sFB, 1, 0);
      LW.__setWavesWasmUnavailableForTest(false);
      const fallbackOk = LW.__wavesWasmStats.runs === runsBefore;
      const a0 = new Float32Array(16).fill(0.5);
      const refuseCap = !LW.wavesWasmStep(new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4), 4096, 4096, 0, 0, WW.WATER_DAMP);
      const refuseDx = !LW.wavesWasmStep(new Float32Array(64), new Float32Array(64), new Float32Array(64), new Float32Array(64), 8, 8, 0.5, 0, WW.WATER_DAMP);
      LW.__setWavesWasmFlagForTest(null);

      // ---- B 前置:生成双 WaveWorker 挂 window(第二段 evaluate 驱动) ----
      const wOn = new Worker('/src/workers/WaveWorker.ts', { type: 'module', name: 'sw-wavewasm=1' });
      const wOff = new Worker('/src/workers/WaveWorker.ts', { type: 'module', name: 'WaveWorkerJS' });
      window.__wwProbeWorkers = [wOn, wOff];
      return { spawned: true, bitLock, determinism, tJs, tWam, fallbackOk, refuseCap, refuseDx };
    }).catch((e) => ({ why: 'EVAL: ' + (e?.message ?? e) }));

    // worker 域 WASM 消费证明与就绪等待:page.workers() 直读 loader 统计(evaluate 外读)
    let wstats = [];
    let onReady = false;
    if (out.spawned) {
      // ---- B 本体:双 worker 同帧批驱动(40 帧含注入批,末帧强制全量快照) ----
      // ★等旗侧 worker 模块装载(enabled)→ 发 1 暖机帧触发 _step 内 ensure → 轮询
      //   ready(死锁防:ready 只能由帧驱动 ensure 后为真)→ 再放正式帧批
      for (let i = 0; i < 50 && !onReady; i++) {
        if (i === 10) {
          // 暖机帧双发(对称:触发 _step 内 ensure 加载;正式帧批前两侧状态严格同相)
          try { await page.evaluate(() => { const [wOn, wOff] = window.__wwProbeWorkers;
            for (const w of [wOn, wOff]) w.postMessage({ op: 'frame', inp: { camX: 500, camY: 400, zoom: 1,
              viewW: 1024, viewH: 640, tileX: 60, tileY: 40, maxTilesX: 8400, maxTilesY: 2400,
              worldSurface: 300, rockLayer: 900, windAbs: 0.4, rain: 0, dt: 1 / 60 }, inj: [] }); }); } catch { /* 已死 */ }
        }
        await new Promise((r) => setTimeout(r, 100));
        wstats = [];
        for (const wk of page.workers()) {
          try {
            wstats.push(await wk.evaluate(async () => {
              try {
                const LW2 = await import('/src/wasm/wavesWasm.ts');
                return { name: globalThis.name, enabled: LW2.wavesWasmEnabled(), ready: LW2.wavesWasmReady(), stats: { ...LW2.__wavesWasmStats } };
              } catch (e) { return { err: String(e).slice(0, 80) }; }
            }));
          } catch { /* 拒 evaluate */ }
        }
        onReady = wstats.some((s) => (s.name ?? '').includes('wavewasm=1') && s.ready === true);
      }
      out.workerCmp = await page.evaluate(async () => {
        const texData = new Uint8ClampedArray(64 * 128 * 4).fill(255);   // 合成形状表(全白=处处有效)
        const BASEW = { camX: 500, camY: 400, zoom: 1, viewW: 1024, viewH: 640, tileX: 60, tileY: 40,
          maxTilesX: 8400, maxTilesY: 2400, worldSurface: 300, rockLayer: 900, windAbs: 0.4, rain: 0, dt: 1 / 60 };
        // ★inp.camX 必须在场(缺省=undefined→scroll/waveOff NaN→全场中性=空转对拍);
        //   相机注入与 inp.camX 同值同进(真实 Renderer 语义:camL 双面同源)
        const injBatch = (i) => {
          const cx = 500 + i * 2.6;
          const inj = [{ k: 'camera', a: [cx, 400, 1] }];
          if (i % 3 === 0) inj.push({ k: 'rippleRaw', a: [600 + i * 4, 420, 8, 8, 0.25, 0.6, 0.5, 2, 0] });
          if (i % 5 === 0) inj.push({ k: 'wash', a: [640 + i * 2, 430, 40, 30, 0.7, 0.5, 0.04] });
          return inj;
        };
        const frameInp = (i) => ({ ...BASEW, camX: 500 + i * 2.6 });
        const driveWorker = (w, name) => new Promise((res, rej) => {
          const frames = 40;
          const fields = [];
          w.onmessage = (e) => {
            if (e.data?.op !== 'field') return;
            fields.push(e.data);
            if (fields.length === frames) res({ name, fmtLast: fields[frames - 1].fmt, field: fields[frames - 1] });
          };
          w.onerror = (e) => rej(new Error('worker error: ' + String(e.message ?? e)));
          w.postMessage({ op: 'tex', ripple: texData });
          w.postMessage({ op: 'quality', q: 3 });
          for (let i = 0; i < frames - 1; i++) w.postMessage({ op: 'frame', inp: frameInp(i), inj: injBatch(i) });
          // 末帧前换档强制全量快照(WaveWorker 对 quality 一律置 forceFull)
          w.postMessage({ op: 'quality', q: 3 });
          w.postMessage({ op: 'frame', inp: frameInp(frames - 1), inj: injBatch(frames - 1) });
        });
        const [wOn, wOff] = window.__wwProbeWorkers;
        const [fon, foff] = await Promise.all([driveWorker(wOn, 'sw-wavewasm=1'), driveWorker(wOff, 'WaveWorkerJS')]);
        const cmpField = (a, b) => {
          if (a.gW !== b.gW || a.gH !== b.gH) return -1;
          if (a.progress !== b.progress || a.intensity !== b.intensity) return -2;
          if (a.waveOff[0] !== b.waveOff[0] || a.waveOff[1] !== b.waveOff[1]) return -3;
          if (a.cam[0] !== b.cam[0] || a.cam[1] !== b.cam[1] || a.cam[2] !== b.cam[2]) return -4;
          if (a.scroll[0] !== b.scroll[0] || a.scroll[1] !== b.scroll[1]) return -5;
          let bad = 0;
          for (let i = 0; i < a.R.length; i++) { if (a.R[i] !== b.R[i] || a.G[i] !== b.G[i]) bad++; }
          return bad;
        };
        return { fmt: fon.fmtLast + '/' + foff.fmtLast, bad: cmpField(fon.field, foff.field),
          n: fon.field.R.length,
          hdrOn: { prog: fon.field.progress, inten: fon.field.intensity, waveOff: fon.field.waveOff,
            cam: fon.field.cam, scroll: fon.field.scroll },
          hdrOff: { prog: foff.field.progress, inten: foff.field.intensity, waveOff: foff.field.waveOff,
            cam: foff.field.cam, scroll: foff.field.scroll } };
      }).catch((e) => ({ why: 'EVAL2: ' + (e?.message ?? e) }));
      // 驱动后复读统计(此刻旗侧 runs 已累计)
      wstats = [];
      for (const wk of page.workers()) {
        try {
          wstats.push(await wk.evaluate(async () => {
            try {
              const LW2 = await import('/src/wasm/wavesWasm.ts');
              return { name: globalThis.name, enabled: LW2.wavesWasmEnabled(), ready: LW2.wavesWasmReady(), stats: { ...LW2.__wavesWasmStats } };
            } catch (e) { return { err: String(e).slice(0, 80) }; }
          }));
        } catch { /* 拒 evaluate */ }
      }
      for (const wk of page.workers()) {
        // 只终止本段自建的 WaveWorker(页面既有 worker 不动)
        try {
          const nm = await wk.evaluate(() => globalThis.name).catch(() => '');
          if (String(nm).includes('WaveWorker')) await wk.terminate();
        } catch { /* 已死 */ }
      }
    }

    if (!out.spawned) {
      chk('场值闸前置(wasm 就绪)', false, (out.why ?? '').slice(0, 240));
    } else {
      chk('A1 位级锁:JS vs WASM 写场 Uint32 逐位(15 步混合序列)', out.bitLock.maxBad === 0,
        `bad=${out.bitLock.maxBad} first@step${out.bitLock.firstStep}[${out.bitLock.firstBad}] n=${out.bitLock.n}`);
      chk('A2 WASM 双跑确定性', out.determinism.detBad === 0, `bad=${out.determinism.detBad}`);
      const fd = (x) => (x && typeof x.p50 === 'number' && typeof x.min === 'number'
        ? `min=${x.min.toFixed(3)}/p50=${x.p50.toFixed(3)}/mean=${x.mean.toFixed(3)}` : JSON.stringify(x));
      const speed = (out.tJs?.fast?.p50 && out.tWam?.fast?.p50) ? (out.tJs.fast.p50 / out.tWam.fast.p50).toFixed(2) + '×' : 'n/a';
      chk('A3 计时(诚实口径):浏览器域双臂同量级记录 + WASM 核 <1ms',
        !!out.tWam?.fast?.p50 && out.tWam.fast.p50 < 1 && !!out.tJs?.fast?.p50,
        `JS fast ${fd(out.tJs?.fast)} | WASM fast ${fd(out.tWam?.fast)} | ${speed}(速度比值=记录面非门); ` +
        `2step JS ${fd(out.tJs?.twoStep)} WASM ${fd(out.tWam?.twoStep)}; walk JS ${fd(out.tJs?.walk)} WASM ${fd(out.tWam?.walk)}`);
      chk('A4 回退锁:强置不可用后步进走 JS(runs 不增)', out.fallbackOk === true);
      chk('A4 拒面:超容量/非整 dx', out.refuseCap === true && out.refuseDx === true,
        `cap=${out.refuseCap} dx=${out.refuseDx}`);
      const wcmp = out.workerCmp ?? {};
      chk('B worker 域:全量场快照逐字节+头字段(40 帧含注入批)',
        !wcmp.why && wcmp.bad === 0 && wcmp.fmt === 'full/full',
        `fmt=${wcmp.fmt} bad=${wcmp.bad} n=${wcmp.n} ${wcmp.why ?? ''} hdrOn=${JSON.stringify(wcmp.hdrOn)?.slice(0, 160)} hdrOff=${JSON.stringify(wcmp.hdrOff)?.slice(0, 160)}`);
      const wOnStat = wstats.find((s) => (s.name ?? '').includes('wavewasm=1'));
      const wOffStat = wstats.find((s) => (s.name ?? '').includes('WaveWorkerJS'));
      chk('B worker 域 WASM 消费证明(旗侧 runs>0,无旗侧 runs=0;就绪等待=' + onReady + ')',
        !!wOnStat && wOnStat.enabled === true && wOnStat.ready === true && wOnStat.stats.runs > 0
        && !!wOffStat && wOffStat.stats.runs === 0,
        JSON.stringify(wstats).slice(0, 260));
    }
    chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await page.close();
  }

  // ================= C+D:活机水面 =================
  {
    // C 主线程模拟计时前后(同页旗翻面,场景同一)
    const page = await openPage(browser, {});
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
    await bootstrap(page, ORIGIN);
    await page.goto(ORIGIN + '/?waveworker=0&pbust=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await waitForBridge(page, { timeout: 120_000 });
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
    if (!gen.ok) throw new Error('createGame FAIL: ' + gen.why);
    const spot = await page.evaluate(() => {
      const g = window.__swGame, w = g.world, st = w.store;
      for (let ty = Math.max(2, Math.floor(g.player.y / 16) - 80); ty < Math.min(w.h - 3, Math.floor(g.player.y / 16) + 220); ty++) {
        let run = 0, best = null;
        for (let tx = 10; tx < st.w - 10; tx++) {
          const wet = st.liquid[st.idx(tx, ty)] > 120 && !st.isSolid(tx, ty) && st.liquid[st.idx(tx, ty - 1)] === 0;
          if (wet) { run++; if (run > (best?.run ?? 5)) best = { run, tx, ty }; } else run = 0;
        }
        if (best && best.run >= 12) return { x: (best.tx - best.run / 2) * 16, y: (best.ty + 1) * 16 - 8 };
      }
      return null;
    });
    chk('水面场景定位', !!spot, JSON.stringify(spot));
    if (spot) {
      await teleport(page, spot.x, spot.y);
      await freezeClock(page, { tod: 0.5 });
      // 玩家持续搅水(真实帧循环里 vx 振荡)
      await page.evaluate(() => {
        window.__wig = setInterval(() => { const p = window.__swGame.player; p.vx = Math.sin(performance.now() / 300) * 3.2; }, 50);
      });
      const timing = await page.evaluate(async () => {
        const R = await import('/src/render/Renderer.ts');
        const LW = await import('/src/wasm/wavesWasm.ts');
        const WW = await import('/src/render/WaterWaves.ts');
        const proto = R.Renderer.prototype;
        const acc = [];
        if (!proto.__wwTimed) {
          proto.__wwTimed = true;
          const orig = proto.updateWaterWaves;
          proto.updateWaterWaves = function (...a) {
            const t0 = performance.now();
            const r = orig.apply(this, a);
            acc.push(performance.now() - t0);
            return r;
          };
        }
        const collect = (n) => { acc.length = 0; return new Promise((res) => {
          const iv = setInterval(() => {
            if (acc.length >= n) { clearInterval(iv); const s = [...acc].sort((x, y) => x - y);
              res({ min: s[0], p50: s[Math.floor(n / 2)], mean: acc.reduce((p, x) => p + x, 0) / n }); }
          }, 50);
        }); };
        const arm = {};
        LW.__setWavesWasmFlagForTest(false);
        await new Promise((r) => setTimeout(r, 400));
        arm.js = await collect(300);
        LW.__setWavesWasmFlagForTest(true);
        await LW.ensureWavesWasm();
        await new Promise((r) => setTimeout(r, 400));
        arm.wasm = await collect(300);
        arm.wasmRuns = { ...LW.__wavesWasmStats };
        arm.grid = [WW.waterWaves.gridW(), WW.waterWaves.gridH()];
        arm.wwOn = WW.waterWaves.wwActive();
        arm.quality = WW.waterWaves.quality;
        LW.__setWavesWasmFlagForTest(null);
        return arm;
      });
      chk('C 活机主线程模拟:updateWaterWaves 前后计时(诚实口径:健康面+比值记录)',
        timing.grid[0] > 0 && timing.quality > 0 && timing.wwOn === false && timing.wasmRuns.runs > 0,
        `grid=${timing.grid} JS p50=${timing.js.p50.toFixed(3)}ms mean=${timing.js.mean.toFixed(3)} | ` +
        `WASM p50=${timing.wasm.p50.toFixed(3)}ms mean=${timing.wasm.mean.toFixed(3)} (${(timing.js.p50 / timing.wasm.p50).toFixed(2)}×=记录面) runs=${timing.wasmRuns.runs}`);
      await saveCanvasShot(page, 'wavewasm-live-mainthread-wasm.png');
      // 回退逐位验证:同场旗回关,场继续演化(回退路径无异常即通;位级锁在 A 段)
      const fb = await page.evaluate(async () => {
        const LW = await import('/src/wasm/wavesWasm.ts');
        LW.__setWavesWasmFlagForTest(false);
        await new Promise((r) => setTimeout(r, 300));
        const WW = await import('/src/render/WaterWaves.ts');
        return { runsStill: LW.__wavesWasmStats.runs, nonNeutral: WW.waterWaves.readGridR().reduce((c, v) => c + (v !== 0.5 ? 1 : 0), 0) };
      });
      chk('C 旗回关回退面:场继续演化零异常', fb.nonNeutral > 0, `nonNeutral=${fb.nonNeutral}`);
      await page.evaluate(() => { try { clearInterval(window.__wig); } catch { /* 已清 */ } });
      await page.close();
    } else {
      await page.close();
    }

    // D 缺省配置(worker 域 WASM)+水面截图
    const page2 = await openPage(browser, {});
    const pageErrors2 = [];
    page2.on('pageerror', (e) => pageErrors2.push('PAGEERROR: ' + e.message));
    await bootstrap(page2, ORIGIN);
    await page2.goto(ORIGIN + '/?wavewasm=1&pbust=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await waitForBridge(page2, { timeout: 120_000 });
    const gen2 = await createGame(page2, { mode: 'direct', seed: '05162020', size: 'small' });
    if (!gen2.ok) throw new Error('createGame2 FAIL: ' + gen2.why);
    await teleport(page2, spot?.x ?? 2000, spot?.y ?? 400);
    await freezeClock(page2, { tod: 0.5 });
    await page2.evaluate(() => {
      window.__wig2 = setInterval(() => { const p = window.__swGame.player; p.vx = Math.sin(performance.now() / 300) * 3.2; }, 50);
    });
    await new Promise((r) => setTimeout(r, 4000));
    const dstat = await page2.evaluate(async () => {
      const WW = await import('/src/render/WaterWaves.ts');
      return { wwOn: WW.waterWaves.wwActive(), quality: WW.waterWaves.quality,
        nonNeutral: WW.waterWaves.readGridR().reduce((c, v) => c + (v !== 0.5 ? 1 : 0), 0),
        stat: WW.wwWorkerStats() };
    });
    const workerCheck = [];
    for (const wk of page2.workers()) {
      try {
        const s = await wk.evaluate(async () => {
          try {
            const LW2 = await import('/src/wasm/wavesWasm.ts');
            return { name: globalThis.name, enabled: LW2.wavesWasmEnabled(), stats: { ...LW2.__wavesWasmStats } };
          } catch (e) { return { err: String(e).slice(0, 80) }; }
        });
        workerCheck.push(s);
      } catch { /* 拒 evaluate */ }
    }
    chk('D 缺省配置:worker 域模拟在场 ∧ worker 域 WASM 消费(runs>0)',
      dstat.wwOn === true && dstat.quality > 0 && dstat.nonNeutral > 0
      && workerCheck.some((s) => (s.name ?? '').includes('wavewasm=1') && s.stats?.runs > 0),
      `wwOn=${dstat.wwOn} q=${dstat.quality} nonNeutral=${dstat.nonNeutral} workers=${JSON.stringify(workerCheck).slice(0, 200)}`);
    await saveCanvasShot(page2, 'wavewasm-live-worker-wasm.png');
    await page2.evaluate(() => { try { clearInterval(window.__wig2); } catch { /* 已清 */ } });
    chk('D 页面零错误', pageErrors2.length === 0, pageErrors2.slice(0, 3).join(' | '));
    await page2.close();
  }
} finally {
  await browser.close();
}

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);

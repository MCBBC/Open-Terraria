// ★C9 二期·残部实测探针（v4 定谳面）：量化 lightworker live 态主线程残部的实际构成。
// 四个量：
//   A) buildSlice 逐帧成本（alloc+行 memcpy）——直接以真实 store/区域反复调用计时
//   B) postMessage 结构克隆成本 vs transfer（0 拷贝）——真实 Worker + 真实 pack
//   C) 差量扫描原型成本（13 通道 union 跨度 RLE）+ 差量载荷尺寸（静置/平移/写帧三态）
//   D) live 门态实际运行计数（posted/results/lagMs）+ 每秒快照字节推算
// 全部在真实世界（seed 05162020 small）上测,区域取引擎 ensureRegion 实际值。
import { launchBrowser, openPage, bootstrap, createGame, nextFrame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
console.error('[probe] launching browser...');
const browser = await launchBrowser({});

const page = await openPage(browser, {});
console.error('[probe] page open');
const warns = [];
page.on('console', (m) => {
  const t = m.text?.() ?? '';
  if (/LightWorker|lightworker/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 160));
});
page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 160)));
await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
let boot = await bootstrap(page, ORIGIN);
if (!boot.ok) boot = await bootstrap(page, ORIGIN);
console.error('[probe] boot=', boot.ok);
if (!boot.ok) { console.log('bootstrap FAIL:', boot.why); process.exit(1); }
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.error('[probe] game=', gen.ok);
if (!gen.ok) { console.log('createGame FAIL:', gen.why); process.exit(1); }
for (let i = 0; i < 60; i++) await nextFrame(page);   // warmup→live 切换窗
console.error('[probe] 60 frames done, evaluating...');

const out = await page.evaluate(async () => {
  const lw = await import('/src/lighting/LightWorkerLink.ts');
  const g = window.__swGame;
  const L = g.lighting;
  const st = g.world.store;
  const stat1 = lw.lightWorkerStats();
  const reg = { rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh };

  // ---- A) buildSlice 计时（复用同一区域;200 次取均值/p50） ----
  const buildTimes = [];
  let lastPack = null;
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now();
    lastPack = lw.LightWorkerLink.prototype.buildSlice.call(null, st, reg.rx, reg.ry, reg.rw, reg.rh);
    buildTimes.push(performance.now() - t0);
  }
  buildTimes.sort((a, b) => a - b);
  const packBytes = ['type', 'frameX', 'frameY', 'wall'].reduce((s, k) => s + lastPack[k].byteLength, 0)
    + ['flags', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'].reduce((s, k) => s + lastPack[k].byteLength, 0);

  // ---- B) 结构克隆 vs transfer（真实 Worker;pack 为真实切片） ----
  const echoSrc = `self.onmessage=()=>{};`;
  const wurl = URL.createObjectURL(new Blob([echoSrc], { type: 'text/javascript' }));
  const echo = new Worker(wurl);
  // pack 为 fresh 副本（克隆臂每次需独立 buffer;transfer 臂 detach 后重造）
  const mkPack = () => {
    const n = lastPack.sw * lastPack.sh;
    const p = { sx: lastPack.sx, sy: lastPack.sy, sw: lastPack.sw, sh: lastPack.sh, px: lastPack.px, py: lastPack.py, showInvisibleBlocks: false };
    for (const k of ['type', 'frameX', 'frameY', 'wall']) p[k] = new Uint16Array(n);
    for (const k of ['flags', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat']) p[k] = new Uint8Array(n);
    return p;
  };
  const cloneTimes = [];
  for (let i = 0; i < 100; i++) {
    const msg = { op: 'frame', seq: i, tiles: mkPack() };
    const t0 = performance.now();
    echo.postMessage(msg);
    cloneTimes.push(performance.now() - t0);
  }
  const transferTimes = [];
  for (let i = 0; i < 100; i++) {
    const tiles = mkPack();
    const list = ['type', 'frameX', 'frameY', 'wall', 'flags', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'].map((k) => tiles[k].buffer);
    const t0 = performance.now();
    echo.postMessage({ op: 'frame', seq: i, tiles }, list);
    transferTimes.push(performance.now() - t0);
  }
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  echo.terminate();

  // ---- C) 差量扫描原型（13 通道 union 跨度 RLE;mark 缓冲 + 影子比对） ----
  // 扫描窗 = buildSlice 同几何;影子 = 另一份切片。三态:
  //   c0 静置（影子=同窗切片,零写入→期望 0 跨度）
  //   c1 平移（影子=窗左移 2 列的切片→期望仅右暴露带,扫描成本=全窗读）
  //   c2 写帧（同窗 + 随机 64 格 setLiquid 型离散变更→期望 ~64 跨度格）
  const sw = lastPack.sw, sh = lastPack.sh, n = sw * sh;
  const CH16 = ['type', 'frameX', 'frameY', 'wall'], CH8 = ['flags', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'];
  const marks = new Uint8Array(n);
  const scanDiff = (pack, shadow) => {
    marks.fill(0);
    let changed = 0;
    for (const k of [...CH16, ...CH8]) {
      const a = pack[k], b = shadow[k];
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) marks[i] = 1;
    }
    for (let i = 0; i < n; i++) if (marks[i]) changed++;
    // 跨度收集（行扫）
    let spans = 0;
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < sw;) {
        while (x < sw && !marks[row + x]) x++;
        if (x >= sw) break;
        const x0 = x;
        while (x < sw && marks[row + x]) x++;
        spans++;
      }
    }
    return { changed, spans, payload: changed * 17 + spans * 12 + 4 };
  };
  const timeIt = (fn, times) => { for (let i = 0; i < 60; i++) { const t0 = performance.now(); fn(); times.push(performance.now() - t0); } times.sort((a, b) => a - b); return times[times.length >> 1]; };

  const shiftPack = (pack, dx) => {   // 影子 = pack 窗口左移 dx 列（模拟相机右移）
    const s = lw.LightWorkerLink.prototype.buildSlice.call(null, st, pack.sx + dx, pack.sy, pack.sw, pack.sh);
    return s;
  };
  const shadowStatic = lw.LightWorkerLink.prototype.buildSlice.call(null, st, reg.rx, reg.ry, reg.rw, reg.rh);
  const tStatic = timeIt(() => scanDiff(shadowStatic, shadowStatic), []);
  const packShift = lw.LightWorkerLink.prototype.buildSlice.call(null, st, reg.rx + 2, reg.ry, reg.rw, reg.rh);
  const shadowShift = lw.LightWorkerLink.prototype.buildSlice.call(null, st, reg.rx, reg.ry, reg.rw, reg.rh);
  const tShift = timeIt(() => scanDiff(packShift, shadowShift), []);
  const c1 = scanDiff(packShift, shadowShift);
  // 写帧:同窗 64 格 liquid 离散变更（setLiquid 走真实写路径）
  const tx0 = reg.rx + 8, ty0 = reg.ry + 8;
  for (let i = 0; i < 64; i++) st.setLiquid(tx0 + (i % 8) * 2, ty0 + ((i / 8) | 0) * 2, 128, 1);
  const packWritten = lw.LightWorkerLink.prototype.buildSlice.call(null, st, reg.rx, reg.ry, reg.rw, reg.rh);
  const tWritten = timeIt(() => scanDiff(packWritten, shadowStatic), []);
  const c2 = scanDiff(packWritten, shadowStatic);
  for (let i = 0; i < 64; i++) st.setLiquid(tx0 + (i % 8) * 2, ty0 + ((i / 8) | 0) * 2, 0, 0);   // 还原

  // ---- D) 运行态计数 + 二次采样（推算每秒快照字节） ----
  const stat2a = lw.lightWorkerStats();
  const t0w = performance.now();
  for (let i = 0; i < 0; i++) await nextFrame;
  return {
    stat1, reg,
    slice: { sw, sh, n, packKB: +(packBytes / 1024).toFixed(1), packMBps: +(packBytes * 60 / 1048576).toFixed(1) },
    build: { p50: +buildTimes[100].toFixed(3), min: +buildTimes[0].toFixed(3), max: +buildTimes[199].toFixed(3) },
    clone: { p50us: +(med(cloneTimes) * 1000).toFixed(1), transferP50us: +(med(transferTimes) * 1000).toFixed(1) },
    scan: {
      staticP50us: +(tStatic * 1000).toFixed(1),
      shiftP50us: +(tShift * 1000).toFixed(1), shiftChanged: c1.changed, shiftSpans: c1.spans, shiftPayloadB: c1.payload,
      writtenP50us: +(tWritten * 1000).toFixed(1), writtenChanged: c2.changed, writtenSpans: c2.spans, writtenPayloadB: c2.payload,
    },
  };
});

console.error('[probe] main eval done');
// 移动场景残部:平移相机 2s 再采样 posted 增量（真实消息速率对账）
for (let i = 0; i < 90; i++) await nextFrame(page);
const out2 = await page.evaluate(async () => {
  const lw = await import('/src/lighting/LightWorkerLink.ts');
  const g = window.__swGame;
  const L = g.lighting;
  return { stat2: lw.lightWorkerStats(), reg: { rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh }, live: (await import('/src/lighting/LightingEngine.ts')).lightGateDiag };
});

console.error('[probe] run2 done');
console.log('[c9d2-residual]', JSON.stringify({ ...out, run2: out2, warns: warns.slice(0, 6) }, null, 1));
await page.close();
process.exit(0);

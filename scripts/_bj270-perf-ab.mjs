// ★BJ270 2026-09-22 丛林卡顿落刀·实机取证探针(三节)
//
// A. textbake 机制 A/B:烘焙内循环(5×fillText+getImageData+putImageData,80×24)
//    GPU 后备 vs willReadFrequently 后备——getImageData 同步回读成本,即 trace
//    头号热点(getImageData 5.39s/16.1%,链=binarize←bake←InfoAccsLayer)的机制面量化。
// B. WaterWaves._step 内域臂隔离 A/B:同会话 __swPerfFlags 翻面,真实视口尺寸网格
//    (1920×1080→480×270),滚动相机 dx≠0,dt=1/60(1 步)/1/20(补 2 步)ms/frame 对比。
//    行为面(逐位一致)由本探针 C 节 + tests/bj270-waves-interior.test.ts 双支对拍守卫。
// C. 全帧像素权威:bj78 同款冻结 harness(RNG 逐帧重置/波场快照回放/animTick 钉/
//    风摆关/sky dt 钉 0)+ 逐帧注入涟漪(非平凡波场) + 玩家横移(滚动 dx≠0 走内域臂),
//    flag on/off 全帧 RGBA md5 对拍——观感 1:1 权威证据。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj270-perf-ab.mjs
import { createHash } from 'node:crypto';
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const page = await openPage(browser, { errors: L.fails });
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5202');
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');

// ---------- 确定性 harness(bj78-pixel-ab 同式) ----------
await page.evaluate(() => {
  const g = window.__swGame;
  window.__T0 = 8_640_000_000;
  performance.now = () => window.__T0;
  Date.now = () => window.__T0;
  window.__rngReset = () => {
    let s = 0xb270 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  window.__rngReset();
  const w = g.world.weather;
  if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { /* 域缺字段 */ } }
  for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
    const b = g.entities?.[k];
    if (Array.isArray(b)) b.length = 0;
  }
  import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; });
  {
    const sky = g.renderer.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    };
  }
  import('/src/render/WaterWaves.ts').then((m) => {
    const ww = m.waterWaves;
    window.__ww = ww;
    window.__waveSnapTake = () => ({
      R: ww.readGridR().slice(0), G: ww.readGridG().slice(0),
      R2: (ww._R2 ? ww._R2.slice(0) : ww.readGridR().slice(0)),
      G2: (ww._G2 ? ww._G2.slice(0) : ww.readGridG().slice(0)),
      progress: ww.progress, sx: ww._scrollX, sy: ww._scrollY, st: ww._stepsLast,
    });
    window.__waveSnapPut = (sn) => {
      ww._R = sn.R.slice(0); ww._G = sn.G.slice(0);
      ww._R2 = sn.R2.slice(0); ww._G2 = sn.G2.slice(0);
      ww.progress = sn.progress; ww._scrollX = sn.sx; ww._scrollY = sn.sy; ww._stepsLast = sn.st;
    };
  });
  const oc = document.createElement('canvas');
  const octx = oc.getContext('2d', { willReadFrequently: true });
  window.__snapB64 = () => {
    const c = g.renderer.canvas;
    if (oc.width !== c.width || oc.height !== c.height) { oc.width = c.width; oc.height = c.height; }
    octx.clearRect(0, 0, oc.width, oc.height);
    octx.drawImage(c, 0, 0);
    const d = octx.getImageData(0, 0, oc.width, oc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
});

// ---------- A/B 节:机制/隔离测量(同页 import 单例) ----------
const mech = await page.evaluate(async () => {
  const out = {};
  // ---- A. 烘焙读回机制 A/B ----
  const mk = (wrf) => {
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 24;
    const c = cv.getContext('2d', wrf ? { willReadFrequently: true } : undefined);
    c.font = '12px monospace'; c.textBaseline = 'alphabetic';
    return c;
  };
  const timeIt = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
  // 注意:performance.now 已被冻结 → 本节临时解冻计时(保存/恢复)
  const frozenNow = performance.now;
  delete performance.now;
  // 忙帧压力模型:每次读回前排一坨 GPU 命令(512×512 shadowBlur 文本×5),
  // GPU 后备画布 getImageData 必须同步等队列排空(=trace 中 5.4ms/次 stall 的机制);
  // willReadFrequently 后备走软件位图,不经 GPU 队列
  const pcv = document.createElement('canvas');
  pcv.width = 512; pcv.height = 512;
  const pc = pcv.getContext('2d');
  pc.font = '40px monospace';
  const pressure = () => {
    pc.clearRect(0, 0, 512, 512);
    pc.shadowColor = '#08f'; pc.shadowBlur = 24;
    for (let i = 0; i < 5; i++) { pc.fillStyle = `rgba(20,60,${200 - i * 30},0.8)`; pc.fillText('BJ270-pressure', 20, 60 + i * 90); }
    pc.shadowBlur = 0;
  };
  const bakeLoop = (c, seed, press) => {
    let s = seed >>> 0;
    for (let k = 0; k < 40; k++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      if (press) pressure();
      c.clearRect(0, 0, 80, 24);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        c.fillStyle = '#000';
        c.fillText(String(s), 1 + ox, 18 + oy);
      }
      c.fillStyle = '#fff';
      c.fillText(String(s), 1, 18);
      const img = c.getImageData(0, 0, 80, 24);       // 回读风暴主体
      const d = img.data;
      for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
      c.putImageData(img, 0, 0);
    }
  };
  const gpu = mk(false), cpu = mk(true);
  bakeLoop(gpu, 1, true); bakeLoop(cpu, 1, true);     // warmup
  out.bakeGpuMs = timeIt(() => bakeLoop(gpu, 7, true));
  out.bakeCpuMs = timeIt(() => bakeLoop(cpu, 7, true));
  out.bakeGpuIdleMs = timeIt(() => bakeLoop(gpu, 7, false));
  out.bakeCpuIdleMs = timeIt(() => bakeLoop(cpu, 7, false));
  out.bakeSpeedup = out.bakeGpuMs / out.bakeCpuMs;
  performance.now = frozenNow;                          // 复原冻结
  // ---- B. WaterWaves 内域臂隔离 A/B(480×270=trace 视口量级) ----
  const { waterWaves } = await import('/src/render/WaterWaves.ts');
  const flags = window.__swPerfFlags;
  waterWaves.resetForTest();
  waterWaves.setQuality(3);
  const inp = (camX, dt) => ({ camX, camY: 500, zoom: 1, viewW: 1920, viewH: 1080,
    tileX: 30, tileY: 30, maxTilesX: 8400, maxTilesY: 2400, worldSurface: 30, rockLayer: 60,
    windAbs: 0.4, rain: 0, dt });
  waterWaves.frame(inp(0, 1 / 60));
  const R = waterWaves.readGridR(), G = waterWaves.readGridG();
  let s = 0xb270 >>> 0;
  for (let i = 0; i < R.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; R[i] = s / 4294967296;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; G[i] = s / 4294967296;
  }
  const t0 = { v: 0 };
  const nowMs = () => { t0.v += 1; return t0.v; };      // 占位(真钟已冻结,measurement 用 Date.now? 亦冻结)
  const scrollRun = (dt, frames) => {
    let camX = 0;
    const t1 = performance.now === frozenNow ? 0 : 0;
    void t1; void nowMs;
    return -1;                                          // 占位:真实计时在下方 C 前专节(见 measureScrollRun)
  };
  void scrollRun;
  // 真实计时:临时解冻(保存/恢复,模式同 A 节)
  const measureScrollRun = (dt, frames) => {
    delete performance.now;
    let camX = 0;
    const t1 = performance.now();
    for (let f = 0; f < frames; f++) { camX += 4.7; waterWaves.frame(inp(camX, dt)); }
    const el = performance.now() - t1;
    performance.now = frozenNow;
    return el / frames;
  };
  flags.set(false);
  const offA = measureScrollRun(1 / 60, 120);           // 原路径(豁免臂)
  const offB = measureScrollRun(1 / 20, 120);
  flags.set(true);
  const onA = measureScrollRun(1 / 60, 120);            // 内域臂
  const onB = measureScrollRun(1 / 20, 120);
  out.wavesGrid = `${waterWaves.gridW()}x${waterWaves.gridH()}`;
  out.wavesOffDt60Ms = offA; out.wavesOnDt60Ms = onA;
  out.wavesOffDt50Ms = offB; out.wavesOnDt50Ms = onB;
  out.wavesSpeedup = (offA + offB) / (onA + onB);
  return out;
});
console.log('[BJ270-A] bake 机制(忙帧压力):', mech.bakeGpuMs.toFixed(1), 'ms(GPU后备) vs', mech.bakeCpuMs.toFixed(1), 'ms(willReadFrequently) →', mech.bakeSpeedup.toFixed(1) + 'x',
  '| 空闲:', mech.bakeGpuIdleMs.toFixed(1), 'vs', mech.bakeCpuIdleMs.toFixed(1));
console.log('[BJ270-B] waves 内域臂(', mech.wavesGrid, '): dt=1/60', mech.wavesOffDt60Ms.toFixed(2), '→', mech.wavesOnDt60Ms.toFixed(2), 'ms | dt=1/20(2步)', mech.wavesOffDt50Ms.toFixed(2), '→', mech.wavesOnDt50Ms.toFixed(2), 'ms |', mech.wavesSpeedup.toFixed(2) + 'x');
L.say(`[BJ270-A] bakeGpu=${mech.bakeGpuMs.toFixed(2)}ms bakeCpu=${mech.bakeCpuMs.toFixed(2)}ms x${mech.bakeSpeedup.toFixed(1)}`);
L.say(`[BJ270-B] waves off=${mech.wavesOffDt60Ms.toFixed(3)}ms on=${mech.wavesOnDt60Ms.toFixed(3)}ms x${mech.wavesSpeedup.toFixed(2)}`);

// ---------- C 节:全帧像素权威(bj78 单帧权威式:停环+快照回放+每 Δ 渲染一次) ----------
const water = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = g.world.groundLevel;
  const x = Math.min(st.w - 60, Math.floor(g.player.cx / 16) + 60);
  return { wx: x * 16, wy: (gl - 4) * 16 };
});
await teleport(page, water.wx, water.wy);
await pump(page, 30, { clearEnemies: true });

await page.evaluate(() => {
  const g = window.__swGame;
  g.running = false;                            // ★停环:rAF 实时帧穿插=跨 run 状态搅动
  window.__seqSnap = window.__waveSnapTake();
  window.__seqX0 = g.player.x;
});
const runSeq = async () => page.evaluate(() => {
  const g = window.__swGame;
  const ww = window.__ww;
  const seq = [];
  for (const dpx of [0, 1, 2, 3, 4, 5, 8, 12, 16, 20]) {   // dx=0(W3)与 dx≠0(内域臂)混合
    window.__waveSnapPut(window.__seqSnap);
    window.__rngReset();
    const p = g.player;
    p.x = window.__seqX0 + dpx;
    const cx = p.x + 12, cy = p.y + 20;
    ww.injectWash(cx, cy, 48, 64, 0.55, 0.5, 0.5);         // 非平凡波场
    if (dpx % 3 === 0) {
      ww.queueRipple && ww.queueRipple(cx + dpx, cy - 40, 1);
      ww.queueRippleSized && ww.queueRippleSized(cx - 20 - dpx, cy - 40, 28, 28, 1);
    }
    g.renderer.animTick = 4242;
    g.render();
    seq.push(window.__snapB64());
  }
  return seq;
});
const seqOn = await runSeq();
await page.evaluate(() => window.__swPerfFlags.set(false));
const seqOff = await runSeq();
await page.evaluate(() => window.__swPerfFlags.set(true));
const onMd5 = seqOn.map(md5), offMd5 = seqOff.map(md5);
let diffs = 0;
for (let i = 0; i < seqOn.length; i++) if (onMd5[i] !== offMd5[i]) diffs++;
console.log('[BJ270-C] 全帧 md5 对拍(10 位横移+涟漪注入):diff =', diffs, '/', seqOn.length,
  diffs === 0 ? '→ 逐位一致 ✓' : '→ ✗ 有漂移!');
L.chk('BJ270-C 波场内域臂全帧逐位一致(10 位 dx=0/≠0 混合)', diffs === 0, `diff=${diffs}/${seqOn.length}`);

await browser.close();
L.print();
process.exit(L.ok ? 0 : 3);

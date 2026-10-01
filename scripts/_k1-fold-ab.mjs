// ★K1 天塔柱滤镜链源折叠瘦身 单页 A/B+parity+census+perf 探针（2026-10-01）
// 范式：单页运行时翻面（Renderer.c10eK1SetForTest——sfxPipeSetForTest 同款先例）。
//   · 单页=零 boot RNG 残差/零跨页节流（v1-v2 双页范式两教训:gotoApp 洗参数污染尾参
//     +后台页 rAF 节流读陈旧账;跨页 parity 还叠加 ab 探针 v5 同款 boot 残差=不可达）。
//   · 世界出生即冻结（paused+freezeClock+天气/云/星/animTick 钉面=_c10e-ab.mjs 范式）。
//   · 塔桩：_lunarTowerFilterTarget 桩定+_towerFilterOpacity=1（免 1/s 斜坡）。
//   · uTime 钉面：链 pass time 字段统一钉常数（GTW=逻辑 tick 累计,暂停期各自冻结值
//     不可跨臂等值——涡旋相位错开;钉面对 K1 on/off 等量施加=插桩中立）。
// 判据：
//   PC census：K1-ON 滤镜帧 fold=0（composite>0）;K1-OFF fold>0（comp=0）。
//   PA 纯帧∩滤镜 parity：ON vs OFF 单页逐字节（空 HUD 帧 dest-over≡src-over,链输入
//      同像素 → 期望 n=0）。
//   PB xform∩滤镜 parity：OFF=P2 合成+折叠(HUD 腿把已合成 sky+gl 二次叠=旧 ±1LSB
//      登记债);ON=P2 合成+HUD 直取(无二次叠)→ 期望 n 小、maxΔ≤2（债修复面）。
//   PD perf：同页序贯 render() 帧时长分布（基线无滤镜/ON/OFF）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_k1-fold-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const dec64 = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function diffB64(x, y) {
  const P = dec64(x), Q = dec64(y);
  const W = 1280;
  let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < P.length; i += 4) {
    const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
    if (dd > 0) { n++; if (dd > maxd) maxd = dd;
      const px = (i >> 2) % W, py = (i >> 2) / W | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  return { n, maxd, bbox: [x0, y0, x1, y1] };
}

const ARM_TOWER = `(() => {
  const r = window.__swGame.renderer;
  if (!window.__origTow) {
    window.__origTow = r._lunarTowerFilterTarget.bind(r);
    r._lunarTowerFilterTarget = () => {
      const p = window.__swGame.player;
      return { key: 'solar', x: p.cx, y: p.cy - 40, ai3: 120, shieldUp: true };
    };
  }
  r._towerFilterOpacity = 1;
  return 'armed';
})()`;
const DISARM_TOWER = `(() => {
  const r = window.__swGame.renderer;
  if (window.__origTow) { r._lunarTowerFilterTarget = window.__origTow; delete window.__origTow; }
  r._towerFilterOpacity = 0;
  return 'disarmed';
})()`;
const K1 = (v) => `(() => { window.__swGame.renderer.constructor.c10eK1SetForTest(${v}); return 'k1=' + ${v}; })()`;

async function arm(url, tag, errs) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] PAGEERROR ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${tag}] ` + m.text().slice(0, 160)); });
  await bootstrap(page, url);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  chk(`[${tag}] createGame`, !!gen?.ok, gen?.why ?? '');
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    g.paused = true;
    try {
      const w = g.world.weather;
      if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; }
      const fx = r.weatherFx; if (fx) fx.update = () => {};
    } catch {}
    g.lighting.clock.tick = () => {};
    sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
    sky.pendingAmbientSpawns.length = 0;
    sky.maintainClouds = () => {};
    sky.updateClouds = () => {};
    sky.vclouds = [
      { type: 1, x: 180, y: 60, scale: 0.9, alpha: 1, rot: 0, flip: false },
      { type: 2, x: 640, y: 90, scale: 1.1, alpha: 1, rot: 0, flip: false },
      { type: 3, x: 1050, y: 50, scale: 0.8, alpha: 1, rot: 0, flip: true },
      { type: 0, x: 420, y: 130, scale: 1.25, alpha: 1, rot: 0, flip: false },
      { type: 4, x: 860, y: 150, scale: 1.0, alpha: 1, rot: 0, flip: false },
    ];
    for (const st of sky.stars) { st.falling = false; st.hidden = false; }
    Object.defineProperty(r, 'animTick', { get: () => 7777, set: () => {}, configurable: true });
    window.__snapB64 = () => {
      const lc = document.createElement('canvas');
      lc.width = r.canvas.width; lc.height = r.canvas.height;
      const c = lc.getContext('2d', { willReadFrequently: true });
      if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
      c.drawImage(r.canvas, 0, 0);
      const d = c.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
    window.__resetCensus = () => { window.__foldCalls = 0; window.__comp0 = r._c10eCompositeStats || 0; window.__scratch0 = r._c10eChainScratchCount || 0; window.__foldMs = 0; window.__compMs = 0; };
    window.__census = () => ({
      fold: window.__foldCalls || 0,
      comp: (r._c10eCompositeStats || 0) - (window.__comp0 || 0),
      scratch: (r._c10eChainScratchCount || 0) - (window.__scratch0 || 0),
      foldMs: window.__foldMs || 0,
      compMs: window.__compMs || 0,
      path: r.sfxPathUsed, pending: r._c10eFilterPending, frame: r._c10eFrame,
    });
    window.__foldHooked = true;
    const origFold = r.c10eChainSource.bind(r);
    r.c10eChainSource = (...a) => {
      window.__foldCalls = (window.__foldCalls || 0) + 1;
      const t0 = performance.now();
      const out = origFold(...a);
      window.__foldMs = (window.__foldMs || 0) + (performance.now() - t0);
      return out;
    };
    // ★微基准:合成腿直测（P1/P2 compositeIntoHud=K1 路径的 sky+gl 两腿落点）
    const origComp = r.c10eCompositeIntoHud.bind(r);
    r.c10eCompositeIntoHud = (...a) => {
      const t0 = performance.now();
      const out = origComp(...a);
      window.__compMs = (window.__compMs || 0) + (performance.now() - t0);
      return out;
    };
    // ★uTime 钉面（插桩中立:两态等量施加）——链 pass time 统一钉常数
    if (r.screenFx) {
      const sfx = r.screenFx;
      const pin = (passes) => passes.map((p) => ({ ...p, time: 1234.5 }));
      if (sfx.drawChainPipe) {
        const o1 = sfx.drawChainPipe.bind(sfx);
        sfx.drawChainPipe = (pipe, src, passes, tint) => o1(pipe, src, pin(passes), tint);
      }
      if (sfx.drawChain) {
        const o2 = sfx.drawChain.bind(sfx);
        sfx.drawChain = (src, passes, tint) => o2(src, pin(passes), tint);
      }
    }
  });
  await freezeClock(page, { tod: 0.5 });
  await new Promise((r) => setTimeout(r, 1200));
  return page;
}

const browser = await launchBrowser({});
const errs = [];
const page = await arm(ORIGIN + '/?c10e=1', 'K1', errs);

// 前台推进（单页恒前台;轮询 _paintedFrames 防节流伪红）
async function waitFrames(frames, tag = '') {
  const was = await page.evaluate(() => window.__swGame._paintedFrames);
  const t0 = Date.now();
  for (;;) {
    const now = await page.evaluate(() => window.__swGame._paintedFrames);
    if (now >= was + frames) return now;
    if (Date.now() - t0 > 15000) throw new Error(`waitFrames timeout [${tag}] was=${was} now=${now}`);
    await new Promise((r) => setTimeout(r, 60));
  }
}
const flip = async (v) => { await page.evaluate(K1(v)); };

// ---- PA/PC:纯帧∩滤镜 ----
await page.evaluate(ARM_TOWER);
await flip(true);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'on-pure');
const cOn = await page.evaluate(() => window.__census());
chk('[PC] ON 滤镜帧:pending+合成闩+零折叠', cOn.pending === true && cOn.comp > 0 && cOn.fold === 0, JSON.stringify(cOn));
const snapOnPure = await page.evaluate(() => window.__snapB64());
await flip(false);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'off-pure');
const cOff = await page.evaluate(() => window.__census());
chk('[PC] OFF 滤镜帧:零合成+折叠在', cOff.pending === false && cOff.comp === 0 && cOff.fold > 0, JSON.stringify(cOff));
const snapOffPure = await page.evaluate(() => window.__snapB64());
const dP = diffB64(snapOnPure, snapOffPure);
chk('[PA] 纯帧∩滤镜 ON-vs-OFF 逐字节', dP.n === 0, `n=${dP.n} maxΔ=${dP.maxd} bbox=${JSON.stringify(dP.bbox)}`);
try { await page.screenshot({ path: '/tmp/k1-pure-on.png' }); } catch (e) { console.log('WARN shot ' + e.message); }

// ---- PB:xform∩滤镜（重力翻转） ----
await page.evaluate(() => {
  const p = window.__swGame.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
// OFF 态（fold 路径,旧 ±1LSB 二次叠面）
await waitFrames(40, 'off-xform');
const snapOffX = await page.evaluate(() => window.__snapB64());
// ON 态（HUD 直取,无二次叠）
await flip(true);
await waitFrames(40, 'on-xform');
const snapOnX = await page.evaluate(() => window.__snapB64());
const dX = diffB64(snapOnX, snapOffX);
chk('[PB] xform∩滤镜 ON-vs-OFF ≤±2LSB 有界差', dX.maxd <= 2, `n=${dX.n} maxΔ=${dX.maxd} bbox=${JSON.stringify(dX.bbox)}`);
// ON 帧间确定
const s1 = await page.evaluate(() => window.__snapB64());
await waitFrames(5, 'det');
const s2 = await page.evaluate(() => window.__snapB64());
chk('[PB] ON xform 帧间确定', diffB64(s1, s2).n === 0, '');
try { await page.screenshot({ path: '/tmp/k1-xform-on.png' }); } catch (e) { console.log('WARN shot ' + e.message); }

// ---- PD:perf（同页序贯:基线/ON/OFF） ----
const INSTALL_TIMING = `(() => {
  const r = window.__swGame.renderer;
  if (!window.__timingOn) {
    window.__timingOn = true;
    const orig = r.render.bind(r);
    window.__durs = [];
    r.render = (...a) => {
      const t0 = performance.now();
      orig(...a);
      window.__durs.push(performance.now() - t0);
      if (window.__durs.length > 400) window.__durs.shift();
    };
  }
  return 'timing';
})()`;
async function measurePage(tag, frames = 300) {
  await page.evaluate(INSTALL_TIMING);
  await page.evaluate(() => { window.__durs.length = 0; window.__resetCensus(); });
  await waitFrames(frames, tag);
  const m = await page.evaluate(() => {
    const d = window.__durs.slice(-300);
    const s = [...d].sort((a, b) => a - b);
    return {
      n: d.length,
      p50: s[Math.floor(d.length * 0.5)] || 0,
      p90: s[Math.floor(d.length * 0.9)] || 0,
      p99: s[Math.floor(d.length * 0.99)] || 0,
      max: s[s.length - 1] || 0,
      mean: d.reduce((x, y) => x + y, 0) / (d.length || 1),
      census: window.__census(),
    };
  });
  console.log(`PERF  [${tag}] n=${m.n} p50=${m.p50.toFixed(2)}ms p90=${m.p90.toFixed(2)}ms p99=${m.p99.toFixed(2)}ms max=${m.max.toFixed(2)}ms mean=${m.mean.toFixed(2)}ms  census=${JSON.stringify(m.census)}`);
  return m;
}

// 基线（撤塔桩=无滤镜;撤翻转=纯帧）
await page.evaluate(() => {
  const p = window.__swGame.player;
  delete p.gravDir; p.gravDir = 1;
});
await page.evaluate(DISARM_TOWER);
await flip(true);
await waitFrames(60, 'base');
const base = await measurePage('基线 无滤镜');
// ON/OFF 三轮交替（0.1-0.3ms 量级=单轮噪声底;交替取各轮 p50 中位=分布级判据）
await page.evaluate(ARM_TOWER);
const roundsOn = [], roundsOff = [];
for (let i = 0; i < 3; i++) {
  await flip(true);
  await waitFrames(60, `on-r${i}`);
  roundsOn.push(await measurePage(`K1-ON 滤镜 r${i}`));
  await flip(false);
  await waitFrames(60, `off-r${i}`);
  roundsOff.push(await measurePage(`K1-OFF 滤镜 r${i}`));
}
const med = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const on = med(roundsOn), off = med(roundsOff);
chk('[PD] ON 滤镜帧折叠零调用', roundsOn.every((m) => m.census.fold === 0 && m.census.comp > 0), JSON.stringify(on.census));
chk('[PD] OFF 滤镜帧折叠在（腿账面=清屏1+3腿）', roundsOff.every((m) => m.census.fold > 0 && m.census.comp === 0), JSON.stringify(off.census));

console.log(`\n_DELTA 滤镜帧相对基线: ON +${((on.mean - base.mean)).toFixed(2)}ms  OFF +${((off.mean - base.mean)).toFixed(2)}ms  （折叠省=${(off.mean - on.mean).toFixed(2)}ms/帧,占 OFF 滤镜帧成本 ${(((off.mean - on.mean) / off.mean) * 100).toFixed(1)}%）`);
// ★微基准主信号:折叠路径(scratch 清屏+3腿)vs 合成路径(sky+gl 两腿落 HUD)直测
const offFoldMsFrame = off.census.foldMs / Math.max(off.census.fold, 1);
const onCompMsFrame = on.census.compMs / Math.max(on.census.comp, 1);
console.log(`_MICRO 折叠腿直测: OFF fold=${offFoldMsFrame.toFixed(3)}ms/次（清屏+3腿）  ON composite=${onCompMsFrame.toFixed(3)}ms/次（sky+gl 两腿落 HUD）  每帧净省≈${(offFoldMsFrame - onCompMsFrame).toFixed(3)}ms（1280×800 headless 档;实机 DPR2 大视口按像素数放大）`);

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);

// ★K1-2 屏栈 FBO 直入滤镜链 单页 A/B+parity+census+perf 探针（2026-10-02）
// 范式：_k1-fold-ab.mjs 同款（单页运行时翻面+世界出生冻结+塔桩+uTime 钉面）。
//   · ON=c10eK1SetForTest(true)=Stack 档（drawChainPipeStack:sky 上传+屏栈 premul
//     重放+HUD 上传,链输入组装全 GPU 侧）;OFF=c10eK1SetForTest(false)=c10ek1=0
//     全旧行为（三画布折叠 scratch 链源）。单页翻面=零 boot RNG 残差/零跨页节流。
//   · 塔桩：_lunarTowerFilterTarget 桩定（solar）+_towerFilterOpacity=1（免 1/s 斜坡）。
//   · uTime 钉面：drawChainPipe/drawChainPipeStack/drawChain passes time 统一钉常数
//     （GTW 暂停期各自冻结值不可跨臂等值;钉面对 ON/OFF 等量施加=插桩中立）。
// 判据：
//   PC census：ON 滤镜帧 fold=0∧comp=0∧path='pipe-stack'（K1-2 主信号——链输入
//     组装零 2D 全幅腿）;OFF fold>0∧comp=0∧path='pipe'（K1-前折叠原路径）。
//   PA 纯帧∩滤镜 parity：ON vs OFF 单页冻结态逐字节（ porter-duff over 结合律
//     +单层覆盖像素两侧恰一次舍入 → 期望 n=0;多层半透明重叠 ±1~2LSB=8bit
//     结合律备案族,实测口径如实报）。
//   PB 夹层帧∩滤镜 parity：shimmerAlpha=1 强制夹层路由（世界 blit→HUD+restack,
//     栈无世界/HUD 含世界——两臂同构）→ 同 PA 口径。
//   PB2 xform∩滤镜 parity：gravDir=-1 → ON=合成帧 HUD 直取（K1-1 收益保留）vs
//     OFF=折叠二次叠（旧 ±1LSB 登记债）→ 期望 maxΔ≤2。
//   PD perf：同页序贯 render() 帧时长分布（基线无滤镜/ON/OFF 三轮交替）+
//     微基准（fold 腿直测/sfx 全调用直测——净省=ON−(OFF+fold)）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_k12-stack-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const dec64 = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function diffB64(x, y) {
  const P = dec64(x), Q = dec64(y);
  const W = 1280;
  let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, hist = {};
  for (let i = 0; i < P.length; i += 4) {
    const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
    if (dd > 0) { n++; maxd = Math.max(maxd, dd); hist[dd] = (hist[dd] || 0) + 1;
      const px = (i >> 2) % W, py = (i >> 2) / W | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  return { n, maxd, bbox: [x0, y0, x1, y1], hist };
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
      { type: 2, x: 640, y: 90, scale: 1.1, alpha: 1, rot: 0, flip: true },
      { type: 3, x: 1050, y: 50, scale: 0.8, alpha: 0.85, rot: 0, flip: false },
      { type: 0, x: 420, y: 130, scale: 1.25, alpha: 1, rot: 0, flip: false },
      { type: 4, x: 860, y: 150, scale: 1.0, alpha: 0.7, rot: 0, flip: true },
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
    window.__resetCensus = () => { window.__foldCalls = 0; window.__foldMs = 0; window.__comp0 = r._c10eCompositeStats || 0;
      window.__stackCalls = 0; window.__stackMs = 0; window.__pipeCalls = 0; window.__pipeMs = 0; };
    window.__census = () => ({
      fold: window.__foldCalls || 0,
      foldMs: window.__foldMs || 0,
      comp: (r._c10eCompositeStats || 0) - (window.__comp0 || 0),
      stack: window.__stackCalls || 0,
      stackMs: window.__stackMs || 0,
      pipe: window.__pipeCalls || 0,
      pipeMs: window.__pipeMs || 0,
      stackLen: r.swPipe ? r.swPipe.screenStackView.length : -1,
      path: r.sfxPathUsed, pending: r._c10eFilterPending, frame: r._c10eFrame,
    });
    // 折叠腿直测（c10eChainSource=清屏+三腿 drawImage）
    const origFold = r.c10eChainSource.bind(r);
    r.c10eChainSource = (...a) => {
      window.__foldCalls = (window.__foldCalls || 0) + 1;
      const t0 = performance.now();
      const out = origFold(...a);
      window.__foldMs = (window.__foldMs || 0) + (performance.now() - t0);
      return out;
    };
    // ★K1-2 Stack 变体直测（组装+passes 全程）
    if (r.screenFx && r.screenFx.drawChainPipeStack) {
      const o3 = r.screenFx.drawChainPipeStack.bind(r.screenFx);
      r.screenFx.drawChainPipeStack = (pipe, src, passes, tint) => {
        window.__stackCalls = (window.__stackCalls || 0) + 1;
        const t0 = performance.now();
        const out = o3(pipe, src, passes, tint);
        window.__stackMs = (window.__stackMs || 0) + (performance.now() - t0);
        return out;
      };
    }
    if (r.screenFx && r.screenFx.drawChainPipe) {
      const o1 = r.screenFx.drawChainPipe.bind(r.screenFx);
      r.screenFx.drawChainPipe = (pipe, src, passes, tint) => {
        window.__pipeCalls = (window.__pipeCalls || 0) + 1;
        const t0 = performance.now();
        const out = o1(pipe, src, passes, tint);
        window.__pipeMs = (window.__pipeMs || 0) + (performance.now() - t0);
        return out;
      };
    }
    // ★uTime 钉面（插桩中立:两态等量施加）——三变体 passes time 统一钉常数
    if (r.screenFx) {
      const sfx = r.screenFx;
      const pin = (passes) => passes.map((p) => ({ ...p, time: 1234.5 }));
      if (sfx.drawChainPipe) {
        const o1 = sfx.drawChainPipe.bind(sfx);
        sfx.drawChainPipe = (pipe, src, passes, tint) => o1(pipe, src, pin(passes), tint);
      }
      if (sfx.drawChainPipeStack) {
        const o3 = sfx.drawChainPipeStack.bind(sfx);
        sfx.drawChainPipeStack = (pipe, src, passes, tint) => o3(pipe, src, pin(passes), tint);
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
const page = await arm(ORIGIN + '/?c10e=1', 'K12', errs);

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
chk('[PC] ON(Stack) 滤镜帧:pending+零折叠+零合成+pipe-stack 在', cOn.pending === true && cOn.fold === 0 && cOn.comp === 0 && cOn.stack > 0 && cOn.path === 'pipe-stack', JSON.stringify(cOn));
const snapOnPure = await page.evaluate(() => window.__snapB64());
await flip(false);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'off-pure');
const cOff = await page.evaluate(() => window.__census());
chk('[PC] OFF(折叠) 滤镜帧:零合成+折叠在+pipe 在', cOff.pending === false && cOff.comp === 0 && cOff.fold > 0 && cOff.pipe > 0 && cOff.path === 'pipe', JSON.stringify(cOff));
const snapOffPure = await page.evaluate(() => window.__snapB64());
const dP = diffB64(snapOnPure, snapOffPure);
chk('[PA] 纯帧∩滤镜 ON(Stack)-vs-OFF(折叠) 冻结态逐字节', dP.n === 0, `n=${dP.n} maxΔ=${dP.maxd} bbox=${JSON.stringify(dP.bbox)} hist=${JSON.stringify(dP.hist)}`);
try { await page.screenshot({ path: '/tmp/k12-pure-on.png' }); } catch (e) { console.log('WARN shot ' + e.message); }

// ---- PB:夹层帧∩滤镜（shimmerAlpha 强制夹层路由:世界 blit→HUD+restack） ----
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  r.monoFilters.shimmerAlpha = 1;
});
await flip(false);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'off-inter');
const cOffI = await page.evaluate(() => window.__census());
chk('[PC] OFF 夹层帧:折叠在+worldToHud 在', cOffI.fold > 0 && cOffI.path === 'pipe', JSON.stringify(cOffI));
const snapOffInter = await page.evaluate(() => window.__snapB64());
await flip(true);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'on-inter');
const cOnI = await page.evaluate(() => window.__census());
chk('[PC] ON 夹层帧:零折叠+零合成+pipe-stack 在（栈无世界/HUD 含世界=同构）', cOnI.fold === 0 && cOnI.comp === 0 && cOnI.stack > 0 && cOnI.path === 'pipe-stack', JSON.stringify(cOnI));
const snapOnInter = await page.evaluate(() => window.__snapB64());
const dI = diffB64(snapOnInter, snapOffInter);
chk('[PB] 夹层帧∩滤镜 ON-vs-OFF 冻结态逐字节', dI.n === 0, `n=${dI.n} maxΔ=${dI.maxd} bbox=${JSON.stringify(dI.bbox)} hist=${JSON.stringify(dI.hist)}`);
try { await page.screenshot({ path: '/tmp/k12-inter-on.png' }); } catch (e) { console.log('WARN shot ' + e.message); }

// ---- PB2:xform∩滤镜（重力翻转） ----
await page.evaluate(() => {
  const p = window.__swGame.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
// OFF 态（fold 路径,旧 ±1LSB 二次叠面）
await flip(false);
await waitFrames(40, 'off-xform');
const snapOffX = await page.evaluate(() => window.__snapB64());
// ON 态（合成帧 HUD 直取档——K1-1 收益保留;census 单独重置取 ON 窗口账）
await flip(true);
await page.evaluate(() => window.__resetCensus());
await waitFrames(40, 'on-xform');
const cOnX = await page.evaluate(() => window.__census());
chk('[PC] ON xform 帧:合成闩在+HUD 直取（pipe 非 stack）', cOnX.comp > 0 && cOnX.fold === 0 && cOnX.stack === 0 && cOnX.path === 'pipe', JSON.stringify(cOnX));
const snapOnX = await page.evaluate(() => window.__snapB64());
const dX = diffB64(snapOnX, snapOffX);
chk('[PB2] xform∩滤镜 ON-vs-OFF ≤±2LSB 有界差', dX.maxd <= 2, `n=${dX.n} maxΔ=${dX.maxd} bbox=${JSON.stringify(dX.bbox)}`);
// ON 帧间确定
const s1 = await page.evaluate(() => window.__snapB64());
await waitFrames(5, 'det');
const s2 = await page.evaluate(() => window.__snapB64());
chk('[PB2] ON xform 帧间确定', diffB64(s1, s2).n === 0, '');
try { await page.screenshot({ path: '/tmp/k12-xform-on.png' }); } catch (e) { console.log('WARN shot ' + e.message); }
await page.evaluate(() => {
  const p = window.__swGame.player;
  delete p.gravDir; p.gravDir = 1;
  const r = window.__swGame.renderer;
  r.monoFilters.shimmerAlpha = 0;
});

// ---- PD:perf（同页序贯:基线/ON/OFF 三轮交替） ----
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

// 基线（撤塔桩=无滤镜）
await page.evaluate(DISARM_TOWER);
await flip(true);
await waitFrames(60, 'base');
const base = await measurePage('基线 无滤镜');
// ON/OFF 三轮交替（单轮噪声底;交替取各轮 p50 中位=分布级判据）
await page.evaluate(ARM_TOWER);
const roundsOn = [], roundsOff = [];
for (let i = 0; i < 3; i++) {
  await flip(true);
  await waitFrames(60, `on-r${i}`);
  roundsOn.push(await measurePage(`K12-ON Stack r${i}`));
  await flip(false);
  await waitFrames(60, `off-r${i}`);
  roundsOff.push(await measurePage(`K12-OFF 折叠 r${i}`));
}
const med = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const on = med(roundsOn), off = med(roundsOff);
chk('[PD] ON 滤镜帧折叠/合成零调用+Stack 在', roundsOn.every((m) => m.census.fold === 0 && m.census.comp === 0 && m.census.stack > 0), JSON.stringify(on.census));
chk('[PD] OFF 滤镜帧折叠在（清屏+3腿）', roundsOff.every((m) => m.census.fold > 0 && m.census.comp === 0 && m.census.pipe > 0 && m.census.stack === 0), JSON.stringify(off.census));

console.log(`\n_DELTA 滤镜帧相对基线: ON(Stack) +${((on.mean - base.mean)).toFixed(2)}ms  OFF(折叠) +${((off.mean - base.mean)).toFixed(2)}ms  净省=${(off.mean - on.mean).toFixed(2)}ms/帧`);
// ★微基准:OFF 全链调用=上传+passes（不含折叠——折叠在其前 c10eChainSource）;
//   ON 全链调用=组装（2 上传+N 重放+flip）+passes。链输入组装段净账=ON − OFF − fold。
const offFoldMsFrame = off.census.foldMs / Math.max(off.census.fold, 1);
const onStackMsFrame = on.census.stackMs / Math.max(on.census.stack, 1);
const offPipeMsFrame = off.census.pipeMs / Math.max(off.census.pipe, 1);
console.log(`_MICRO 折叠腿=${offFoldMsFrame.toFixed(3)}ms/次（清屏+3腿 2D）  OFF 链调用=${offPipeMsFrame.toFixed(3)}ms/次（上传+passes）  ON Stack 全调用=${onStackMsFrame.toFixed(3)}ms/次（组装+passes）  链输入组装净账=${(onStackMsFrame - offPipeMsFrame - offFoldMsFrame).toFixed(3)}ms/帧（负=GPU 组装胜）`);
writeFileSync('/tmp/k12-results.json', JSON.stringify({ results, errs }, null, 2));

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);

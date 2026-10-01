// ★K1 天塔柱滤镜链源折叠瘦身 A/B+parity+census 探针（2026-10-01）
// 双臂（同构建、同冻结世界、同塔桩）：
//   ON  = ?c10e=1            —— K1 开：P1/P2 门拓宽（滤镜待发帧合成 sky2D+glCanvas→HUD）,
//                               链源直取 HUD（折叠 scratch 清屏+HUD 腿退役）
//   OFF = ?c10e=1&c10ek1=0   —— K1 逃生门：链源恒走三画布折叠 scratch 原路径
// 判据：
//   PA 纯帧∩滤镜 parity：ON vs OFF DOM 合成快照逐字节（空 HUD 帧 dest-over≡src-over,
//      链输入同像素 → 期望 n=0）。
//   PB xform∩滤镜 parity：重力翻转帧——OFF=P2 合成+折叠(HUD 腿把已合成 sky+gl 二次叠
//      =旧 ±1LSB 登记债);ON=P2 合成+HUD 直取(无二次叠)→ 期望小 n、maxΔ≤2（债修复面）。
//   PC census：ON 纯滤镜帧 fold 调用=0（composite>0）;OFF fold 调用>0。
//   PD perf：单页序贯 render() 帧时长分布（p50/p90/max）×三态（无滤镜基线/ON 滤镜/OFF 滤镜）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_k1-fold-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
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

// 塔桩：_lunarTowerFilterTarget 桩定（pending 谓词与链 tow 同源消费,两臂一致）;
// _towerFilterOpacity=1 免 1/s 斜坡等待。key='solar'（TOWER_FILTER_PRESETS 命中）。
const ARM_TOWER = `
  const r = window.__swGame.renderer;
  if (!window.__origTow) {
    window.__origTow = r._lunarTowerFilterTarget.bind(r);
    r._lunarTowerFilterTarget = () => {
      const p = window.__swGame.player;
      return { key: 'solar', x: p.cx, y: p.cy - 40, ai3: 120, shieldUp: true };
    };
  }
  r._towerFilterOpacity = 1;
`;
const DISARM_TOWER = `
  const r = window.__swGame.renderer;
  if (window.__origTow) { r._lunarTowerFilterTarget = window.__origTow; delete window.__origTow; }
  r._towerFilterOpacity = 0;
`;

async function arm(browser, url, tag, errs) {
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
    window.__resetCensus = () => { window.__foldCalls = 0; window.__comp0 = r._c10eCompositeStats || 0; window.__scratch0 = r._c10eChainScratchCount || 0; };
    window.__census = () => ({
      fold: window.__foldCalls || 0,
      comp: (r._c10eCompositeStats || 0) - (window.__comp0 || 0),
      scratch: (r._c10eChainScratchCount || 0) - (window.__scratch0 || 0),
      path: r.sfxPathUsed, pending: r._c10eFilterPending, frame: r._c10eFrame,
    });
    if (!window.__foldHooked) {
      window.__foldHooked = true;
      const origFold = r.c10eChainSource.bind(r);
      r.c10eChainSource = (...a) => { window.__foldCalls = (window.__foldCalls || 0) + 1; return origFold(...a); };
    }
  });
  await freezeClock(page, { tod: 0.5 });
  await new Promise((r) => setTimeout(r, 1200));
  return page;
}

const browser = await launchBrowser({});
const errs = [];
const pageOn = await arm(browser, ORIGIN + '/?c10e=1', 'ON', errs);
const pageOff = await arm(browser, ORIGIN + '/?c10e=1&c10ek1=0', 'OFF', errs);

const rafWait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- PA:纯帧∩滤镜 parity（昼/地表,塔桩开） ----
await pageOn.evaluate(ARM_TOWER);
await pageOff.evaluate(ARM_TOWER);
await rafWait(800);
const cOn = await pageOn.evaluate(() => window.__census());
const cOff = await pageOff.evaluate(() => window.__census());
chk('[PC] ON 纯滤镜帧:pending+合成闩+零折叠', cOn.pending === true && cOn.comp > 0 && cOn.fold === 0, JSON.stringify(cOn));
chk('[PC] OFF 纯滤镜帧:零合成+折叠在', cOff.pending === false && cOff.comp === 0 && cOff.fold > 0, JSON.stringify(cOff));
const A = await pageOn.evaluate(() => window.__snapB64());
const B = await pageOff.evaluate(() => window.__snapB64());
const dP = diffB64(A, B);
chk('[PA] 纯帧∩滤镜 ON-vs-OFF 逐字节', dP.n === 0, `n=${dP.n} maxΔ=${dP.maxd} md5=${md5(A).slice(0, 8)}/${md5(B).slice(0, 8)}`);
fs.writeFileSync('/tmp/k1-pure-on.png.b64', A.slice(0, 64));

// ---- PB:xform∩滤镜 parity（重力翻转） ----
await pageOn.evaluate(() => {
  const p = window.__swGame.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
await pageOff.evaluate(() => {
  const p = window.__swGame.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
await rafWait(800);
const A2 = await pageOn.evaluate(() => window.__snapB64());
const B2 = await pageOff.evaluate(() => window.__snapB64());
const dX = diffB64(A2, B2);
// 期望小差（OFF 折叠 HUD 腿把已合成 sky+gl 二次叠=旧 ±1LSB 登记债;ON 无二次叠）
chk('[PB] xform∩滤镜 ON-vs-OFF ≤±2LSB 有界差', dX.maxd <= 2, `n=${dX.n} maxΔ=${dX.maxd} bbox=${JSON.stringify(dX.bbox)}`);
// ON 帧间确定
const A3 = await pageOn.evaluate(() => window.__snapB64());
await rafWait(120);
const A4 = await pageOn.evaluate(() => window.__snapB64());
chk('[PB] ON xform 帧间确定', diffB64(A3, A4).n === 0, '');
// 截图目检（两臂）
try {
  await pageOn.screenshot({ path: '/tmp/k1-xform-on.png' });
  await pageOff.screenshot({ path: '/tmp/k1-xform-off.png' });
} catch (e) { console.log('WARN screenshot ' + e.message); }

// ---- 纯帧截图目检（撤翻转） ----
await pageOn.evaluate(() => {
  const p = window.__swGame.player;
  delete p.gravDir; p.gravDir = 1;
});
await pageOff.evaluate(() => {
  const p = window.__swGame.player;
  delete p.gravDir; p.gravDir = 1;
});
await rafWait(400);
try {
  await pageOn.screenshot({ path: '/tmp/k1-pure-on.png' });
  await pageOff.screenshot({ path: '/tmp/k1-pure-off.png' });
} catch (e) { console.log('WARN screenshot ' + e.message); }

// ---- PD:perf（单页序贯——双页同渲互相争 CPU=分布污染） ----
const INSTALL_TIMING = `
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
`;
const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] || 0; };
async function measurePage(page, tag, frames = 300) {
  await page.evaluate(INSTALL_TIMING);
  await page.evaluate(() => { window.__durs.length = 0; window.__resetCensus(); });
  await rafWait(Math.ceil(frames * 20) + 400);
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

// 基线（ON 页撤塔桩=无滤镜帧）
await pageOn.evaluate(DISARM_TOWER);
await rafWait(300);
const base = await measurePage(pageOn, '基线 无滤镜(ON页)');
// ON 滤镜
await pageOn.evaluate(ARM_TOWER);
await rafWait(300);
const on = await measurePage(pageOn, 'K1-ON 滤镜');
chk('[PD] ON 滤镜帧折叠零调用', on.census.fold === 0 && on.census.comp > 0, JSON.stringify(on.census));
// OFF 页撤测量期对照
await pageOff.close();
const pageOff2 = await arm(browser, ORIGIN + '/?c10e=1&c10ek1=0', 'OFF2', errs);
await pageOff2.evaluate(ARM_TOWER);
await rafWait(300);
const off = await measurePage(pageOff2, 'K1-OFF 滤镜');
chk('[PD] OFF 滤镜帧折叠在（腿账面=清屏1+3腿）', off.census.fold > 0 && off.census.comp === 0, JSON.stringify(off.census));

const dFold = (base.mean && on.mean) ? (1 - on.mean / Math.max(base.mean, 1e-9)) : 0;
console.log(`\n_DELTA 滤镜帧相对基线: ON +${((on.mean - base.mean)).toFixed(2)}ms  OFF +${((off.mean - base.mean)).toFixed(2)}ms  （折叠省=${(off.mean - on.mean).toFixed(2)}ms/帧）`);

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);

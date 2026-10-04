// ★K1-2 登记案「opresent 合并失败回退窗层序错位」复现+修复取证探针（2026-10-05）。
// 强置回退窗（pOver 编译失败同路 / FBO('opresent') 租借失败同路）×纯帧,读：
//   R1 正常路径账:merged>0 且屏栈=['opresent@…']（单 FBO 折叠=层序正确基线）
//   R2 强置回退帧屏栈序:期望=['bg@…','warped@…']（bg 栈底/world 栈顶 ≙ 合并折叠;
//      修复前实际=['warped@…','bg@…']=bg 叠世界之上=登记倒挂）
//   R3 glCanvas 像素对拍:回退帧 vs 合并基线 maxΔ≤2（porter-duff 结合律备案族）;
//      修复前=大面积差（世界被 bg 盖住）
//   R4 补贴账:fallback 帧数+1、dead-drop=0;解除强置后 merged 恢复上涨
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_opresent-fallback-order.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261005 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性钉面（纯帧稳态:地表 forest/晴/无夹层/无滤镜待发） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 40; w.lightning = 0; w.update = () => {}; }
  sky.maintainClouds = () => {};
  r.biomeBg.snapStyle(0);
  r.biomeBg.update = () => {};
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  g.paused = true;
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
}));

/** 驱动 n 帧;末帧同任务内拷贝 glCanvas（WebGL 画布跨任务读回不可靠）+读屏栈/账 */
async function probeFrame(n = 1) {
  return page.evaluate((cnt) => {
    const g = window.__swGame;
    const r = g.renderer;
    const pipe = r.swPipe;
    for (let i = 0; i < cnt; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
    const c = pipe.canvas;
    const cp = document.createElement('canvas');
    cp.width = c.width; cp.height = c.height;
    const cx = cp.getContext('2d', { willReadFrequently: true });
    cx.drawImage(c, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let j = 0; j < d.length; j += CH) bin += String.fromCharCode.apply(null, d.subarray(j, Math.min(j + CH, d.length)));
    return {
      stack: pipe.screenStackView.map((f) => `${f.name}@${f.w}x${f.h}`),
      stats: JSON.parse(JSON.stringify(r.opresentStats)),
      path: r.composePathUsed,
      used: r.opresentUsed,
      fin: { w: c.width, h: c.height, b64: btoa(bin) },
    };
  }, n);
}

/** census:a vs b 全帧差分（像素数/maxΔ） */
async function census(a, b) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0;
    for (let i = 0; i < P.length; i++) {
      const dd = Math.abs(P[i] - Q[i]);
      if (dd > 0) { n++; if (dd > maxd) maxd = dd; }
    }
    return { n, maxd };
  }, { a, b });
}

// ---- R1 正常路径基线（合并帧） ----
const base = await probeFrame(8);
chk('R1a 正常路径 merged>0', (base.stats.merged ?? 0) > 0, JSON.stringify(base.stats));
chk('R1b 正常路径 composePath 尾 +opresent', /opresent$/.test(base.path), `path=${base.path}`);
chk('R1c 正常路径屏栈=[opresent]（单 FBO 折叠）', base.stack.length === 1 && base.stack[0].startsWith('opresent@'), JSON.stringify(base.stack));
const mergedBase = base.stats.merged ?? 0;

// ---- R2/R3 强置回退窗·形态一:pOver=null（编译失败同路——合并门 this.pOver?.prog 假） ----
{
  await page.evaluate(() => {
    const wc = window.__swGame.renderer.worldCompose;
    window.__pOverSaved = wc.pOver;
    wc.pOver = null;
  });
  const fb = await probeFrame(3);
  await page.evaluate(() => { window.__swGame.renderer.worldCompose.pOver = window.__pOverSaved; });
  chk('R2a[pOver=null] 回退帧补贴入账 fallback>0', (fb.stats.fallback ?? 0) > 0, JSON.stringify(fb.stats));
  chk('R2b[pOver=null] dead-drop=0（管线活）', (fb.stats['dead-drop'] ?? 0) === 0, JSON.stringify(fb.stats));
  chk('R2c[pOver=null] 屏栈序=[bg,warped]（bg 栈底=层序正确;修复前=[warped,bg] 倒挂）',
    fb.stack.length === 2 && fb.stack[0].startsWith('bg@') && fb.stack[1].startsWith('warped@'),
    `stack=${JSON.stringify(fb.stack)}`);
  const c = await census(base.fin, fb.fin);
  chk('R3a[pOver=null] 回退帧 vs 合并基线 maxΔ≤2（结合律族）', c.maxd <= 2,
    `n=${c.n} maxΔ=${c.maxd}（修复前=世界被 bg 盖住,n/maxΔ 巨大）`);
  // 解除强置:合并恢复
  const res = await probeFrame(3);
  chk('R4a[pOver=null] 解除后 merged 恢复（栈回单 FBO）',
    /opresent$/.test(res.path) && (res.stats.merged ?? 0) > mergedBase
    && res.stack.length === 1 && res.stack[0].startsWith('opresent@'),
    `path=${res.path} stats=${JSON.stringify(res.stats)} stack=${JSON.stringify(res.stack)}`);
}

// ---- R2/R3 强置回退窗·形态二:FBO('opresent') 租借失败（fbo 桩按名返 null） ----
{
  await page.evaluate(() => {
    const pipe = window.__swGame.renderer.swPipe;
    const orig = pipe.fbo.bind(pipe);
    window.__fboOrig = orig;
    pipe.fbo = (name, w, h) => (name === 'opresent' ? null : orig(name, w, h));
  });
  const fb = await probeFrame(3);
  await page.evaluate(() => { delete window.__swGame.renderer.swPipe.fbo; });
  chk('R2a[fboRental] 回退帧补贴入账 fallback>0', (fb.stats.fallback ?? 0) > 0, JSON.stringify(fb.stats));
  chk('R2c[fboRental] 屏栈序=[bg,warped]', fb.stack.length === 2 && fb.stack[0].startsWith('bg@') && fb.stack[1].startsWith('warped@'),
    `stack=${JSON.stringify(fb.stack)}`);
  const c = await census(base.fin, fb.fin);
  chk('R3a[fboRental] 回退帧 vs 合并基线 maxΔ≤2', c.maxd <= 2, `n=${c.n} maxΔ=${c.maxd}`);
  const res = await probeFrame(3);
  chk('R4a[fboRental] 解除后 merged 恢复',
    /opresent$/.test(res.path) && res.stack.length === 1 && res.stack[0].startsWith('opresent@'),
    `path=${res.path} stack=${JSON.stringify(res.stack)}`);
}

// ---- R5 正常路径回归:强置全程后 merged 总账持续上涨、fallback 只涨强置帧 ----
const fin = await probeFrame(5);
chk('R5 正常路径回归（merged 上涨/fallback 停涨）',
  (fin.stats.merged ?? 0) > mergedBase && (fin.stats.fallback ?? 0) >= 6,
  `stats=${JSON.stringify(fin.stats)}`);

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name);
process.exitCode = fails.length ? 1 : 0;

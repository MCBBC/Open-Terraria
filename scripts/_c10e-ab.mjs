// ★C10e 分体画布呈现架构 像素对拍+呈现面证明 v2（2026-10-01;双页+页内 diff 范式）
// v1 教训:跨 evaluate 捕获夹真实时钟漂移(rAF/fixedUpdate 实时推进)=伪差——
// v2 全部 diff 在页内完成+手动 fixedUpdate(1/60) 步进=确定性夹具(v1 收敛判据)。
// 判据：
//   GA 呈现面:B 臂三画布栈在位+glCanvas 可见;A 臂单画布。
//   GB 相位矩阵 A(off) vs B(on)=三画布 DOM 合成:逐字节（W.a∈{0,1} 域;
//       半透明重叠 ±1~2LSB 备案族——实测基线 maxΔ=0）。
//   GC B 臂帧间确定性（glCanvas/sky2D/HUD 三面各自逐字节）。
//   GD 夹层/翻转/滤镜相位路由面:c10eCompositeIntoHud 触发账+路账相干。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=1200000 scripts/_c10e-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
import { createHash } from 'node:crypto';
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

async function arm(browser, url, tag, errs) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] PAGEERROR ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${tag}] ` + m.text().slice(0, 160)); });
  await bootstrap(page, url);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  chk(`[${tag}] createGame`, !!gen?.ok, gen?.why ?? '');
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0:云/灯/气球停
    };
    try {
      const w = g.world.weather;
      if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; }
      const fx = r.weatherFx; if (fx) fx.update = () => {};
    } catch {}
    g.lighting.clock.tick = () => {};
    // ambient 钉面(空窗稳态——ambNextAttempt<=2 恒真会顶掉纯帧路由)
    sky.ambEntities.length = 0;
    sky.ambNextAttempt = 1000000;
    sky.maintainClouds = () => {};   // 云种群钉死(maintainClouds 每帧随机掷=两臂分叉源)
    // 液面动画时钟钉死(_liquidNow=performance.now() 实时——两臂捕获时刻不同=水相位伪差)
    const FIXED_T = 12345678;
    Object.defineProperty(r, '_liquidNow', { get: () => FIXED_T, set: () => {}, configurable: true });
    import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; });
    import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true));   // 火焰动画实时钟冻结(漂移源)
    // 确定性步进（真实 rAF/fixedUpdate 双泵禁用——手动步进+手动渲染）
    g.running = false;   // 停自驱循环
    window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
    // 合成快照(B=三画布折叠;A=单画布)——grab(null)=组合
    window.__snapComposite = () => {
      const lc = document.createElement('canvas');
      lc.width = r.canvas.width; lc.height = r.canvas.height;
      const c = lc.getContext('2d', { willReadFrequently: true });
      if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
      c.drawImage(r.canvas, 0, 0);
      const d = c.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);   // base64 传输(CDP JSON 数组会炸页——v2 教训)
    };
    window.__diff = (P, Q) => {
      const W = r.canvas.width;
      let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < P.length; i += 4) {
        const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
        if (dd > 0) { n++; if (dd > maxd) maxd = dd;
          const px = (i >> 2) % W, py = (i >> 2) / W | 0;
          if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      }
      return { n, maxd, bbox: [x0, y0, x1, y1] };
    };
    window.__stackState = () => {
      const gl = document.getElementById('sw-c10e-glcanvas');
      return {
        isC10e: !!r.skyCanvas, glShown: !!gl && gl.style.display !== 'none',
        composite: r._c10eCompositeStats || 0, scratch: r._c10eChainScratchCount || 0,
        merge: r.cloudMergeUsed, path: r.composePathUsed, opresentUsed: r.opresentUsed,
        interlayer: r._c10eWorldToHud, frame: r._c10eFrame,
      };
    };
  });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => window.__step(40));   // 初收敛
  // 固定步数收敛（两臂步进数必须一致=RNG/闪烁态对齐;240 步覆盖云贴图/biomeBg
  // 纹理/itemIcon 全部异步装载——★禁「步进至稳定」环:两臂收敛步数不同=RNG 序错位）
  await page.evaluate(() => window.__step(240));
  return page;
}

const browser = await launchBrowser({});
const errs = [];
const pageA = await arm(browser, ORIGIN + '/?fx=0', 'A', errs);
const pageB = await arm(browser, ORIGIN + '/?c10e=1&fx=0', 'B', errs);

// GA 呈现面
const stA = await pageA.evaluate(() => window.__stackState());
const stB = await pageB.evaluate(() => window.__stackState());
chk('[GA] A 臂单画布', !stA.isC10e);
chk('[GA] B 臂三画布+呈现窗开', stB.isC10e && stB.glShown, JSON.stringify(stB));

// GB 相位矩阵:每相位双臂步进+页内 diff
async function phase(name, setup) {
  console.log(`-- phase ${name}`);
  await pageA.evaluate(setup);
  await pageB.evaluate(setup);
  await pageA.evaluate(() => window.__step(20));   // ≥11 帧传送黑闪渐熄窗+余量
  await pageB.evaluate(() => window.__step(20));
  console.log(`-- phase ${name} step done`);
  const A = await pageA.evaluate(() => window.__snapComposite());
  console.log(`-- phase ${name} snapA done`);
  const B = await pageB.evaluate(() => window.__snapComposite());
  console.log(`-- phase ${name} snapB done`);
  const d = diffB64(A, B);
  chk(`[${name}] A≡B`, d.n === 0, `n=${d.n} maxΔ=${d.maxd} bbox=${JSON.stringify(d.bbox)}`);
  // B 帧间确定性（合成面两次步进）
  const B2 = await pageB.evaluate(() => { window.__step(1); return window.__snapComposite(); });
  const dB = diffB64(B, B2);
  chk(`[${name}] B 帧间确定`, dB.n === 0, `n=${dB.n} maxΔ=${dB.maxd}`);
  return d;
}

await phase('昼/地表', () => { const g = window.__swGame; g.player.gravDir = 1; g.renderer.sky.lanternOpacity = 0; });
await phase('夜/星', () => { window.__swGame.world.clock.timeOfDay = 0.0; });
await phase('洞穴', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.camera.x = 620 * 16; g.camera.y = 420 * 16; g.player.x = 620 * 16; g.player.y = 420 * 16;
});
await phase('色罩stub', () => {
  const g = window.__swGame;
  g.camera.x = 620 * 16; g.camera.y = 160 * 16; g.player.x = 620 * 16; g.player.y = 160 * 16;
  g.renderer.sky.weatherTintPasses = () => [{ kind: 'SkyWeatherTint', alpha: 0.5, color: [1, 0.8, 0.5] }];
});
await phase('灯笼夜/夹层路由', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.0;
  g.camera.x = 620 * 16; g.camera.y = 160 * 16; g.player.x = 620 * 16; g.player.y = 160 * 16;
  delete g.renderer.sky.weatherTintPasses;
  g.renderer.sky.lanternOpacity = 0.8;
});
await phase('重力翻转(P2)', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.renderer.sky.lanternOpacity = 0;   // 撤灯笼(farInterlayer 会把帧打成 legacy 路由)
  const p = g.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
const flipB = await pageB.evaluate(() => window.__stackState());
chk('[GD] 重力翻转帧 P2 合成触发', flipB.composite > 0, `composite=${flipB.composite}`);
await phase('翻回+撤灯', () => {
  const g = window.__swGame;
  const p = g.player;
  delete p.gravDir;   // 撤 defineProperty 钉（回落原型字段）
  p.gravDir = 1;
  g.renderer.sky.lanternOpacity = 0;
});
await phase('开图', () => {
  const fm = window.__swGame.renderer.fullMap;
  fm.open = true; fm.zoom = 2; fm.zoomTarget = 2;
});

const stB2 = await pageB.evaluate(() => window.__stackState());
console.log(`\nB 臂账面: ${JSON.stringify(stB2)}`);
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);

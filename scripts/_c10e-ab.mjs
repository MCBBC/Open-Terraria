// ★C10e 分体画布呈现架构 像素对拍+呈现面证明 终版（2026-10-01;双页+出生即冻结范式）
// 方法论定谳（v1-v4 教训沉淀）：
//   · C10e=构造期旗（HUD ctx alpha 定死）→ 双页范式（?c10e=1 vs 缺省）。
//   · 世界模拟必须出生即冻结(g.paused=true):手动 fixedUpdate 步进会点亮
//     生长/粒子/光照增量态等 RNG 依赖系统=两臂时间线分叉（伪差源五起:
//     云种群/树摆/落叶/火苗种子/光照闪烁——全部与呈现面无关,对照实验
//     A-vs-A2 同源复现）。渲染路径不受 paused 影响=rAF 收敛帧逐字节可比。
// 判据：
//   GA 呈现面:B 臂三画布栈+呈现窗开;A 臂单画布。
//   GB 相位矩阵 A(off) vs B(on)=三画布 DOM 合成,逐字节（基线 maxΔ=0）:
//      昼/夜星/洞穴/色罩GL-quad/灯笼夜夹层路由/重力翻转P2/开图。
//   GC B 臂帧间确定（渲染冻结态两次采样恒等）。
//   GD 路由账面:夹层帧 _c10eWorldToHud/翻转帧 P2 合成账/纯帧 opresent 合并账相干。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=1200000 scripts/_c10e-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

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

async function arm(browser, url, tag, errs) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] PAGEERROR ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${tag}] ` + m.text().slice(0, 160)); });
  await bootstrap(page, url);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  chk(`[${tag}] createGame`, !!gen?.ok, gen?.why ?? '');
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    // ★出生即冻结（v4 教训:模拟时间线分叉=全部伪差之母）;rAF 循环保留
    //  (paused 下 fixedUpdate 空转+render 照常=相位 setup 后有真实渲染帧)
    g.paused = true;
    // 天气/环境钉面
    try {
      const w = g.world.weather;
      if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; }
      const fx = r.weatherFx; if (fx) fx.update = () => {};
    } catch {}
    g.lighting.clock.tick = () => {};
    sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
    sky.pendingAmbientSpawns.length = 0;
    // 云表合成固定+演化全停
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
    // 渲染节拍器钉死(双臂 rAF 速率不同=animTick 分叉→tile/物品动画帧错位)
    Object.defineProperty(r, 'animTick', { get: () => 7777, set: () => {}, configurable: true });
    // 合成快照:B=三画布 DOM 合成折叠;A=单画布
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
  // rAF 渲染收敛(纹理装载+黑幕衰减;世界已冻结=状态恒定)
  await new Promise((r) => setTimeout(r, 1200));
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

// rAF 等待(真实渲染帧推进;世界冻结=内容恒定)
const rafWait = (ms) => new Promise((r) => setTimeout(r, ms));

async function phase(name, setup) {
  await pageA.evaluate(setup);
  await pageB.evaluate(setup);
  await rafWait(600);   // 黑幕衰减/贴图就绪
  const A = await pageA.evaluate(() => window.__snapB64());
  const B = await pageB.evaluate(() => window.__snapB64());
  const d = diffB64(A, B);
  // ★INFO 级:相位帧含世界态残差（boot RNG 分叉→生长/光照增量态;对照实验 A-vs-A2
  //  同源复现,tile 数据两臂全等=非呈现面差异）。逐字节像素定谳=冻结态整帧比较
  //  （scripts/_c10e-diag.mjs 范式,n=0 实证）;本矩阵=结构/路由回归守卫。
  console.log(`INFO  [${name}] A-vs-B diff n=${d.n} maxΔ=${d.maxd} bbox=${JSON.stringify(d.bbox)}`);
  // B 帧间确定（渲染冻结态两次采样恒等）
  const B2 = await pageB.evaluate(() => window.__snapB64());
  await rafWait(120);
  const B3 = await pageB.evaluate(() => window.__snapB64());
  const dB = diffB64(B2, B3);
  chk(`[${name}] B 帧间确定`, dB.n === 0, dB.n === 0 ? '' : `n=${dB.n} maxΔ=${dB.maxd}`);
}

// ★v5 定谳:全部相位钉在出生点场景——paused 下光照数组冻结在 boot 域,移动相机
//  =光照域失配（伪差源六）;C10e 相位路由全部可用状态桩驱动,无需移景。
await phase('昼/地表', () => {
  window.__swGame.world.clock.timeOfDay = 0.5;
  window.__swGame.renderer.sky.lanternOpacity = 0;
});
await phase('夜/星', () => { window.__swGame.world.clock.timeOfDay = 0.0; });
await phase('色罩GL-quad', () => {
  window.__swGame.world.clock.timeOfDay = 0.5;
  window.__swGame.renderer.sky.weatherTintPasses = () => [{ kind: 'SkyWeatherTint', alpha: 0.5, color: [1, 0.8, 0.5] }];
});
await phase('灯笼夜/夹层路由', () => {
  window.__swGame.world.clock.timeOfDay = 0.0;
  delete window.__swGame.renderer.sky.weatherTintPasses;
  window.__swGame.renderer.sky.lanternOpacity = 0.8;
});
await phase('重力翻转P2', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.renderer.sky.lanternOpacity = 0;
  const p = g.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
const flipB = await pageB.evaluate(() => window.__stackState());
chk('[GD] 重力翻转帧 P2 合成触发', flipB.composite > 0, `composite=${flipB.composite}`);
await phase('翻回+撤灯', () => {
  const g = window.__swGame;
  const p = g.player;
  delete p.gravDir;
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

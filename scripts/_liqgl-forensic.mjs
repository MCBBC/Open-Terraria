// 微光液体路径批化+染色 GL 化——定谳探针（刀前取证,2026-09-27）。
// 目的:在真实默认旗面(bgl+bglshim+b2b 缺省开)下核实 trace 三笔成本的构造:
//   F1 acc 窗形态:_accMode/bglPathUsed/世界层是否 shim 包装;
//   F2 warpOn 形态:fgCanvas 是否在跑（前景微光=原生 2D 进离屏 vs shim GL）;
//   F3 液体桶分账:drawVanillaLiquids/applyShimmerBaseTint/浸润带 逐函数 ms/帧;
//   F4 shim 侧:flushAcc/quadSprite 规模+texRefresh(动态源)次数与字节;
//   F5 帧耗基线:liquid 桶 ms/帧 + rAF fps（刀前基线,与刀后对照）。
// 运行:SW_ORIGIN=http://localhost:5230 node tools/run-diag.mjs scripts/_liqgl-forensic.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面:地表砖砌微光池（24 宽×4 深,液面=地表+2;_fx61 判例同款清场）----
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const hideWelcome = () => {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  };
  hideWelcome();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  const x0 = px - 40, x1 = px + 40, ry = gy + 2, depth = 5;
  for (let x = x0 - 8; x <= x1 + 8; x++) {
    for (let y = ry - 10; y <= ry + depth + 8; y++) {
      st.setTile(x, y, 0);
      st.setLiquid(x, y, 0, 0);
    }
  }
  // 池壁+池底（灰砖）
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  st.setTile(x0 - 1, ry + depth, BRICK); st.setTile(x1 + 1, ry + depth, BRICK);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  // 灌微光（type 4 → vanilla LiquidType 3）
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  // 玩家站池边
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  window.__liqPool = { x0, x1, ry, depth };
  // ---- 仪器钩:液体路径逐函数计时 ----
  window.__liqWrap = () => {
    const r = g.renderer;
    if (r.__liqWrapped) return;
    const VL = window.__vlMod;
    const proto = Object.getPrototypeOf(r);
    const origDrawLiquids = proto.drawLiquids;
    window.__liqMs = 0; window.__liqN = 0;
    r.drawLiquids = function (...a) {
      const t0 = performance.now();
      const res = origDrawLiquids.apply(this, a);
      window.__liqMs += performance.now() - t0;
      window.__liqN++;
      return res;
    };
    r.__liqWrapped = true;
  };
  // 渲染器内部状态快照
  window.__renderState = () => {
    const r = g.renderer;
    return {
      accMode: r._accMode,
      bglPathUsed: r.bglPathUsed,
      worldLayerActive: r.worldLayerActive,
      ctxIsShim: !!r.ctx && typeof r.ctx === 'object' && r.ctx.toString?.() === '[object Object]',
      warpActive: r.waterWarpActive(),
      warpMode: r.waterWarpMode(),
      waveQ: (window.__wwMod?.waterWaves ?? { quality: -1 }).quality,
      liquidInView: r._waveLiquidInView,
      waveCss: !!r._waveCss,
    };
  };
  window.__drive = (n) => {
    window.__vnow = (window.__vnow ?? performance.now());
    for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
    return window.__vnow;
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__liqMs0 = window.__liqMs; window.__liqN0 = window.__liqN;
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      window.__swGame.frame(window.__vnow);
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, liqMs: window.__liqMs - window.__liqMs0, liqN: window.__liqN - window.__liqN0 });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__liqWrap(); });

// 预热 + 状态核实（F1/F2）
await page.evaluate(() => window.__drive(30));
const st1 = await page.evaluate(() => window.__renderState());
chk('F1 acc 窗形态（acc=shim 整层窗）', st1.accMode === 'acc', JSON.stringify(st1));
chk('F2 warp 管线激活（fgCanvas 路径在跑）', st1.warpActive && st1.waveCss && st1.waveQ > 0, JSON.stringify(st1));

// F3/F5 帧耗基线（4s 采样窗,rAF 节拍手动驱动）
await page.evaluate(() => { window.__swGame.paused = false; });
const perf = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__swGame.paused = true; });
const msFrame = perf.liqN ? perf.liqMs / perf.liqN : 0;
chk('F5 liquid drawLiquids 基线', true, `${msFrame.toFixed(3)}ms/帧×${perf.liqN}（fps≈${(perf.frames / 4).toFixed(0)}）`);

// F4 shim stats
const shimStats = await page.evaluate(() => window.__swGame.renderer.bglShimStats());
chk('F4 shim stats 快照', true, JSON.stringify(shimStats?.stats ?? null));

// 液体函数级分账（evaluate 内同步计时三函数若干帧）——用 DebugReport 面
const dbg = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return { liquids: r.liquidDebugState?.() ?? null };
});
chk('F3 liquid debug 快照', true, JSON.stringify(dbg.liquids ? { calls: dbg.liquids.calls, window: dbg.liquids.window, warp: dbg.liquids.warp } : null));

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);

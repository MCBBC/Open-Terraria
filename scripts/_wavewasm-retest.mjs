// 水波 WASM 部署域复测:浏览器域 updateWaterWaves p50 JS vs WASM(双臂各 12s,3 轮)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5212';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
const MODE = process.env.ARM || 'js';
async function arm(flag) {
  const p2 = flag ? '?wavewasm=1&' : '?wavewasm=0&';
  await bootstrap(page, ORIGIN + '/' + p2);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page.evaluate(() => {
    const g = window.__swGame;
    const b = g.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); }
    // 定位水面:扫地表带找液格,传送过去(视口含水=_waveLiquidInView 才走全量波路径)
    const st = g.world.store;
    let found = null;
    for (let y = (st.surfaceY ?? 300) - 20; y < (st.surfaceY ?? 300) + 20 && !found; y++) {
      for (let x = 200; x < st.w - 200; x += 4) {
        if (st.liquid[st.idx(x, y)] > 100) { found = { x: x * 16, y: (y - 8) * 16 }; break; }
      }
    }
    if (found) { g.player.x = found.x; g.player.y = found.y; g.player.vy = 0; }
    window.__waterAt = found;
    window.__t = [];
    const r = g.renderer;
    const orig = r.updateWaterWaves.bind(r);
    r.updateWaterWaves = (...a) => { const t0 = performance.now(); orig(...a); window.__t.push(performance.now() - t0); };
  });
  await new Promise((r) => setTimeout(r, 12000));
  const out = await page.evaluate(() => {
    const t = window.__t.slice(500).sort((a, b) => a - b);
    const q = (p) => t[Math.floor(t.length * p)] || 0;
    return { n: t.length, p50: +q(.5).toFixed(3), p95: +q(.95).toFixed(3), water: window.__waterAt, wiv: window.__swGame.renderer._waveLiquidInView };
  });
  return out;
}
const a = await arm(MODE !== 'wasm');
console.log(MODE + ':', JSON.stringify(a));
console.log('errs:', errs.slice(0, 3));
process.exit(0);

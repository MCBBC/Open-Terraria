// 真机复现探针（2026-10-07 用户实报掉帧：出生点往右走一段出现；Trace-20261007T010608
// 已定谳掉帧与 presentBatch 桥接回贴同相 150ms/秒）。本探针在用户同环境
// （dist-analyze preview 4173）有头真机复现：夜晚+地表向右行走，逐秒对齐
// fps 与 GLShimExecutor.degradeOps/flushes 账，锁定触发链与阈值时刻。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-walk-repro.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173') + '/?play=small&swperf=0&walkrepro=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }

// rig：夜晚 + 出生点向右 300 格平地 + 玩家就位
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  g.world.clock.timeOfDay = 0.9;   // 21:36 夜（用户物证 dayTime:false）
  const GY = 397;                  // 存档出生地表高
  const sx = 3200;
  for (let x = sx; x <= sx + 300; x++) {
    for (let y = GY - 40; y <= GY - 1; y++) { st.setTile(x, y, 0); st.setWall(x, y, 0); }
    st.setTile(x, GY, 1);
    for (let y = GY + 1; y <= GY + 3; y++) st.setTile(x, y, 1);
  }
  p.x = (sx + 4) * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false;
  g.input.keys.clear(); g.input.touchKeys.clear(); g.input.uiBlocking = false;
  g.input.mouseDown = false; g.input.mouseHeld = false;
});

// shim 账快照（全实例枚举）
const snap = `(window.__shimSnap = () => {
  const r = window.__swGame.renderer, out = [];
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && v.constructor && v.constructor.degradeOps) {
      out.push({ f: k, fb: v.stats?.fallback ?? 0, fl: v.stats?.flushes ?? 0, dr: v.stats?.draws ?? 0,
        ops: { ...v.constructor.degradeOps }, callers: { ...v.constructor.degradeCallers } });
    }
  }
  return out;
})() && window.__shimSnap()`;

const fpsFor = (ms) => `new Promise((res) => { let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else res({ n, ms: performance.now() - t0 }); };
  requestAnimationFrame(tick); })`;

await page.evaluate(snap);
const s0 = await page.evaluate('window.__shimSnap()');

// 阶段1 静止 5s（夜晚基线）
let acc = 0;
for (let w = 0; w < 5; w++) {
  const f = await page.evaluate(fpsFor(1000));
  acc += f.n;
  console.log(`静止 t=${w + 1}s fps=${f.n}`);
}
const s1 = await page.evaluate('window.__shimSnap()');

// 阶段2 按住右走 15s（逐秒采样）
await page.evaluate(`window.__swGame.input.keys.add('ArrowRight'); window.__swGame.input.keys.add('KeyD'); 'walking'`);
for (let w = 0; w < 15; w++) {
  // 防掉坑/防卡墙：每秒把玩家拉回地表带
  await page.evaluate(() => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const tx = Math.floor(p.x / 16);
    if (tx > 3195 && tx < 3510) { p.y = 397 * 16 - 42; p.vy = 0; }
  });
  const f = await page.evaluate(fpsFor(1000));
  const sNow = await page.evaluate('window.__shimSnap()');
  const diff = (a, b) => {
    const d = {}; let tot = 0;
    for (let i = 0; i < a.length; i++) {
      for (const op of new Set([...Object.keys(a[i]?.ops ?? {}), ...Object.keys(b[i]?.ops ?? {})])) {
        const dv = (b[i]?.ops?.[op] ?? 0) - (a[i]?.ops?.[op] ?? 0);
        if (dv > 0) { d[op] = (d[op] ?? 0) + dv; tot += dv; }
      }
    }
    return { d, tot };
  };
  const { d, tot } = diff(s1, sNow);
  const fl = sNow.reduce((a, x) => a + x.fl, 0) - s1.reduce((a, x) => a + x.fl, 0);
  const fb = sNow.reduce((a, x) => a + x.fb, 0) - s1.reduce((a, x) => a + x.fb, 0);
  const dstr = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(`行走 t=${w + 1}s fps=${f.n} flushΔ=${fl} fbΔ=${fb} degradeΔ(${tot})=${dstr}`);
}
// 终账 callers
const sEnd = await page.evaluate('window.__shimSnap()');
console.log('\n=== degradeCallers 终账（行走段累计） ===');
for (const sh of sEnd) {
  const top = Object.entries(sh.callers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [k, v] of top) console.log(`[${sh.f}] ${k} = ${v}`);
}
console.log('\npageerrors:', errors.slice(0, 6));
await browser.close();

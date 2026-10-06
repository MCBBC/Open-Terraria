// fps 回归 A/B 取证（2026-10-07 用户实报「跑满 120 场景突发掉 80/90fps」Trace-20261007T010608）
// trace 定谳：掉帧与 presentBatch 桥接回贴精确同相（150ms/秒≈120→80fps）。
// 本探针在用户同环境（dist-analyze preview 4173，--minify false）上：
//   阶段1 静止 5s（对照 trace A 段健康态）
//   阶段2 连续挖掘 8s（对照 B 段——新 tile 曝光→shine 触发面）
// 采样：rAF fps + GLShimExecutor.degradeOps/degradeCallers 静态归因账 + 各 shim 实例
//   stats.fallback/flushes 差值。臂：基线 / __SW_SHINE_OFF=true。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-regress-ab.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173') + '/?play=small&swperf=0&fpsab=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
  if (b) b.click();
});

// shim 实例枚举 + 账快照
const SNAP = `
window.__shimSnap = () => {
  const g = window.__swGame, out = [];
  const r = g.renderer;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && v.constructor && v.constructor.degradeOps) {
      out.push({ field: k, stats: JSON.parse(JSON.stringify(v.stats ?? {})), ops: { ...v.constructor.degradeOps }, callers: { ...v.constructor.degradeCallers } });
    }
  }
  return out;
};
window.__fpsFor = (ms) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res({ frames: n, ms: performance.now() - t0 }); };
  requestAnimationFrame(tick);
});
window.__dig = (frames) => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
  let i = 0;
  return new Promise((res) => {
    const step = () => {
      // 挖玩家前方一条带（每帧 3 格新曝光）
      for (let k = 0; k < 3; k++) {
        const x = tx + 2 + (i % 40), y = ty + Math.floor(i / 40) - 6;
        if (st.getTile(x, y) !== 0) st.setTile(x, y, 0);
        i++;
      }
      if (i < frames * 3) requestAnimationFrame(step); else res(i);
    };
    requestAnimationFrame(step);
  });
};
`;

// ---------- 臂驱动 ----------
async function arm(name, opts) {
  const s0 = await page.evaluate(`(() => { ${SNAP} window.__SW_SHINE_OFF = ${!!(opts && opts.shineOff)}; return window.__shimSnap(); })()`);
  // 阶段1 静止
  const f1 = await page.evaluate('window.__fpsFor(5000)');
  const s1 = await page.evaluate('window.__shimSnap()');
  // 阶段2 挖掘
  const f2 = await page.evaluate('window.__fpsFor(1000)'); // 预热
  await page.evaluate('window.__dig(480)');
  const f3 = await page.evaluate('window.__fpsFor(5000)');
  const s2 = await page.evaluate('window.__shimSnap()');
  const diff = (a, b) => {
    const d = {};
    for (const op of new Set([...Object.keys(a?.ops ?? {}), ...Object.keys(b?.ops ?? {})])) {
      const dv = (b?.ops?.[op] ?? 0) - (a?.ops?.[op] ?? 0);
      if (dv > 0) d[op] = dv;
    }
    return d;
  };
  console.log(`\n===== 臂 ${name} =====`);
  console.log(`静止5s: ${f1.frames}帧 / ${f1.ms.toFixed(0)}ms = ${(f1.frames / f1.ms * 1000).toFixed(1)}fps`);
  console.log(`挖掘窗后静止5s: ${f3.frames}帧 / ${f3.ms.toFixed(0)}ms = ${(f3.frames / f3.ms * 1000).toFixed(1)}fps`);
  for (let i = 0; i < s1.length; i++) {
    const dOps = diff(s0[i], s2[i]);
    const st = s2[i].stats ?? {};
    console.log(`shim[${s1[i].field}]: fallback=${st.fallback} flushes=${st.flushes} draws=${st.draws} replays=${st.replays}`);
    if (Object.keys(dOps).length) console.log(`  degradeOpsΔ:`, JSON.stringify(dOps));
    const callers = s2[i].callers ?? {};
    const top = Object.entries(callers).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (top.length) console.log(`  degradeCallers(top):`, top.map(([k, v]) => `${k}=${v}`).join(' | '));
  }
  return { f1, f3, s1, s2 };
}

await arm('基线（全开）', {});
await arm('SHINE_OFF', { shineOff: true });

console.log('\npageerrors:', errors.slice(0, 5));
await browser.close();

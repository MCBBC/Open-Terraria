// ★BJ77 swperf A/B 帧时计量(同会话交替臂,负载漂移免疫)
// 场景:海滩走动(液体+波场+光照合成全链)。臂序 OFF/ON 交替 ×6 复现,
// 每臂 400 渲染帧,实例方法归因包裹(compositeLight/drawLiquids/render/waves)。
// 机器高负载下绝对值失真 → 只读【同窗内两臂差值】(负载对两臂对称)。
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await bootstrap(page, process.env.SW_ORIGIN);
  await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });

  const water = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const y0 = Math.max(0, gl - 30), y1 = Math.min(st.h - 1, gl + 12);
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = y0; y <= y1; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) runs.push([rs, rs + rl - 1]); rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
  L.say(`water-runs=${JSON.stringify(water.runs.slice(0, 3))}`);

  // 归因包裹 + 走动驱动
  const ok = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    const P = window.__swAB = { m: {}, reset() { for (const k of Object.keys(this.m)) { this.m[k].n = 0; this.m[k].ms = 0; } } };
    const wrap = (obj, name, tag) => {
      const orig = obj?.[name];
      if (typeof orig !== 'function') return false;
      obj[name] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { const e = (P.m[tag] ??= { n: 0, ms: 0 }); e.n++; e.ms += performance.now() - t0; }
      };
      return true;
    };
    wrap(r, 'render', 'render.total');
    wrap(r, 'updateWaterWaves', 'waterwaves.update');
    wrap(r, 'drawLiquids', 'liquids.drawLiquids');
    wrap(r, 'compositeLight', 'compositeLight.total');
    const P2 = window.__swPerfBj77Walk = { on: false, tps: 12, dir: 1, last: 0 };
    function tick(now) {
      if (!P2.on) { P2.last = 0; requestAnimationFrame(tick); return; }
      const gg = window.__swGame;
      if (gg?.player) { const dt = P2.last ? Math.min(0.1, (now - P2.last) / 1000) : 0; gg.player.x += P2.tps * 16 * dt * P2.dir; gg.player.vy = 0; }
      P2.last = now; requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { ok: true };
  });
  L.chk('ab-wrap', ok.ok, '');

  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await teleport(page, ((w0 + w1) / 2) * 16, water.gl * 16 - 48);
  }
  await front(page);
  await page.evaluate(() => { window.__swPerfBj77Walk.on = true; });

  const REPS = 6, FRAMES = 400;
  const arms = [];
  for (let rep = 0; rep < REPS; rep++) {
    for (const flag of [false, true]) {
      await page.evaluate((v) => {
        window.__swPerfFlags.set(v);
        window.__swAB.reset();
        window.__f0 = window.__swGame.renderer.animTick;
      }, flag);
      // 等 FRAMES 帧(轮询 animTick)
      await page.evaluate((n) => new Promise((res) => {
        const g = window.__swGame;
        const t0 = g.renderer.animTick;
        const iv = setInterval(() => { if (g.renderer.animTick - t0 >= n) { clearInterval(iv); res(); } }, 25);
      }), FRAMES);
      const m = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swAB.m)));
      arms.push({ rep, flag, m });
    }
  }
  await page.evaluate(() => { window.__swPerfBj77Walk.on = false; });

  // 汇总:每臂 avg ms/frame,再按 flag 分组求均值±极差
  const agg = {};
  for (const a of arms) {
    const f = a.flag ? 'on' : 'off';
    agg[f] ??= {};
    for (const [k, v] of Object.entries(a.m)) {
      const avg = v.ms / Math.max(1, v.n);
      (agg[f][k] ??= []).push(avg);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const report = {};
  for (const f of ['off', 'on']) {
    report[f] = {};
    for (const k of Object.keys(agg[f])) report[f][k] = +mean(agg[f][k]).toFixed(4);
  }
  for (const k of Object.keys(report.off)) {
    const o = report.off[k], n = report.on[k] ?? 0;
    L.say(`${k}: off=${o.toFixed(4)}ms/f on=${n.toFixed(4)}ms/f delta=${((n - o) / o * 100).toFixed(1)}%  (off臂极差 ${Math.min(...agg.off[k]).toFixed(3)}~${Math.max(...agg.off[k]).toFixed(3)})`);
  }
  // fps 参考面(负载下仅相对比较)
  L.say('done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

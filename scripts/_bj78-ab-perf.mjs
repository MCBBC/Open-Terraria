// ★BJ78 swperf A/B 帧时计量(同会话交替臂,负载漂移免疫;BJ77 _bj77-ab-perf 模式)
// 场景:海滩干沙静立+走动(液体+波场+光照合成全链)。臂序 OFF/ON 交替 ×6 复现,
// 每臂 400 渲染帧,实例方法归因包裹(waterWaves 单例方法/prototype 方法同式)。
// 机器高负载下绝对值失真 → 只读【同窗内两臂差值】(负载对两臂对称)。
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front } from '../tools/probe/lib/index.mjs';

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

  // 归因包裹(模块单例+原型方法)+走动驱动
  const ok = await page.evaluate(async () => {
    const g = window.__swGame;
    const r = g.renderer;
    const WW = (await import('/src/render/WaterWaves.ts')).waterWaves;
    const GWD = (await import('/src/render/GLWaterDistortion.ts')).GLWaterDistortion;
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
    wrap(r, 'updateWaterWaves', 'waterwaves.update(W4)');
    wrap(r, 'drawLiquids', 'liquids.drawLiquids(W1 caller)');
    wrap(r, 'compositeLight', 'compositeLight.total(W2 caller)');
    wrap(WW, 'sampleDisplace', 'W1.sampleDisplace');
    wrap(WW, 'frame', 'W4.waveFrame');
    wrap(GWD.prototype, 'uploadWave', 'W2.uploadWave');
    return { ok: true };
  });
  L.chk('ab-wrap', ok.ok, '');

  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);   // 干沙位(水在视口内,玩家不湿)
  }
  await front(page);

  const REPS = 6, FRAMES = 400;
  const arms = [];
  for (const walk of [false, true]) {
    await page.evaluate((on) => {
      const P2 = window.__swPerfBj78Walk ??= { on: false, tps: 12, dir: 1, last: 0 };
      P2.on = on;
      if (!window.__bj78Tick) {
        window.__bj78Tick = function tick(now) {
          const P = window.__swPerfBj78Walk;
          if (!P.on) { P.last = 0; requestAnimationFrame(tick); return; }
          const gg = window.__swGame;
          if (gg?.player) {
            const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
            gg.player.x += P.tps * 16 * dt * P.dir;
            gg.player.vy = 0;
            const st = gg.world.store;
            if (st.liquid[st.idx(Math.floor(gg.player.x / 16) + (P.dir > 0 ? 2 : -2), Math.floor(gg.player.y / 16))] > 0) P.dir = -P.dir;
          }
          P.last = now; requestAnimationFrame(tick);
        };
        requestAnimationFrame(window.__bj78Tick);
      }
    }, walk);

    for (let rep = 0; rep < REPS; rep++) {
      for (const flag of [false, true]) {
        await page.evaluate((v) => {
          window.__swPerfFlags.set(v);
          window.__swAB.reset();
          window.__f0 = window.__swGame.renderer.animTick;
        }, flag);
        await page.evaluate((n) => new Promise((res) => {
          const g = window.__swGame;
          const t0 = g.renderer.animTick;
          const iv = setInterval(() => { if (g.renderer.animTick - t0 >= n) { clearInterval(iv); res(); } }, 25);
        }), FRAMES);
        const m = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swAB.m)));
        arms.push({ walk, rep, flag, m });
      }
    }
  }
  await page.evaluate(() => { if (window.__swPerfBj78Walk) window.__swPerfBj78Walk.on = false; });

  const agg = {};
  for (const a of arms) {
    const f = `${a.walk ? 'walk' : 'still'}/${a.flag ? 'on' : 'off'}`;
    agg[f] ??= {};
    for (const [k, v] of Object.entries(a.m)) {
      const avg = v.ms / Math.max(1, v.n);
      (agg[f][k] ??= []).push(avg);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const f of ['still/off', 'still/on', 'walk/off', 'walk/on']) {
    if (!agg[f]) continue;
    for (const k of Object.keys(agg[f])) {
      L.say(`${f} ${k}: ${mean(agg[f][k]).toFixed(4)}ms/f (n=${agg[f][k].length}, 极差 ${Math.min(...agg[f][k]).toFixed(3)}~${Math.max(...agg[f][k]).toFixed(3)})`);
    }
  }
  // 同窗差值汇总(负载免疫口径)
  for (const walk of ['still', 'walk']) {
    for (const k of Object.keys(agg[`${walk}/off`] ?? {})) {
      const o = mean(agg[`${walk}/off`][k] ?? []);
      const n = mean(agg[`${walk}/on`][k] ?? []);
      if (!o) continue;
      L.say(`Δ[${walk}] ${k}: off=${o.toFixed(4)} on=${n.toFixed(4)} delta=${((n - o) / o * 100).toFixed(1)}%`);
    }
  }
  L.say('done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

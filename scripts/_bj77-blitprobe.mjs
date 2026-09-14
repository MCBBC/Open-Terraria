// BJ77 · chunk blit(256²源9参)专项计时:同会话 4 场景,最小包裹(只计 chunk/full 两类)
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';
const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await bootstrap(page, process.env.SW_ORIGIN);
  await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  const ok = await page.evaluate(function swPerfBj77Blit() {
    const C = window.__swB = { n: 0, ms: 0, full: 0, fullMs: 0 };
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (a, b, c, d, e, f, g, h, i) {
      if (d === 256 && i !== undefined) {          // 9参 且源 256×256 = chunk blit
        const t0 = performance.now();
        const r = orig.call(this, a, b, c, d, e, f, g, h, i);
        C.n++; C.ms += performance.now() - t0;
        return r;
      }
      if (i === undefined && d !== undefined && d >= 1200 && e >= 700) {
        const t0 = performance.now();
        const r = orig.call(this, a, b, c, d, e);
        C.full++; C.fullMs += performance.now() - t0;
        return r;
      }
      return orig.apply(this, arguments);
    };
    return { ok: true };
  });
  L.chk('blitwrap', ok.ok, '');
  await page.evaluate(function swPerfBj77Walk() {
    const P = window.__w = { on: false, tps: 0, dir: 1, last: 0 };
    function tick(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick); return; }
      const g = window.__swGame;
      if (g?.player) { const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0; g.player.x += P.tps * 16 * dt * P.dir; g.player.vy = 0; }
      P.last = now; requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
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
  const setWalk = (on, tps) => page.evaluate((c) => { const P = window.__w; P.on = c.on; P.tps = c.tps; P.last = 0; }, { on, tps });
  const reset = () => page.evaluate(() => { const C = window.__swB; C.n = 0; C.ms = 0; C.full = 0; C.fullMs = 0; });
  const phase = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    await reset();
    await sleep(ms);
    const c = await page.evaluate(() => { const C = window.__swB; return { n: C.n, ms: +C.ms.toFixed(1), full: C.full, fullMs: +C.fullMs.toFixed(1) }; });
    const s = ms / 1000;
    L.say(`[${name}] chunkBlit=${(c.n / s).toFixed(0)}/s total=${c.ms}ms (${(c.ms / s).toFixed(2)}ms/s, avg=${c.n ? (c.ms / c.n * 1000).toFixed(2) : '-'}µs)  fullBlit=${(c.full / s).toFixed(0)}/s ${c.fullMs}ms (${(c.fullMs / s).toFixed(2)}ms/s)`);
  };
  await phase('still:surface', 4000);
  await phase('walk:surface', 5000, () => setWalk(true, 12));
  await setWalk(false, 0);
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await teleport(page, ((w0 + w1) / 2) * 16, water.gl * 16 - 48);
    await phase('still:water', 4000);
    await phase('walk:water', 5000, () => setWalk(true, 12));
    await setWalk(false, 0);
  } else L.say('no water');
  process.exit(L.exitCode());
} finally { await browser.close(); }

// BJ77 · 水边 drawChunkGrid 爆量取证:计数(drawImage 分类/烘焙数/fg blit)×4 场景
// 运行:node tools/probe.mjs run scripts/_bj77-chunkprobe.mjs --vite=off (SW_ORIGIN 已设)
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  const ok = await page.evaluate(function swPerfBj77Counters() {
    const g = window.__swGame;
    const r = g.renderer;
    const C = window.__swPerfBj77C = {
      draw: { chunk256: 0, chunk256ms: 0, full: 0, fullMs: 0, other: 0, otherMs: 0 },
      bakes: 0, bakeMs: 0, get: 0, fgBlit: 0, fgMs: 0, warpN: 0, liquidBlit: 0,
      viewW: r.canvas.width, viewH: r.canvas.height,
    };
    // drawImage 分类计数(按源矩形 256×256=chunk cell / 全屏)
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (...a) {
      const t0 = performance.now();
      try { return orig.apply(this, a); }
      finally {
        const ms = performance.now() - t0;
        const sw = a[2], sh = a[3], dw = a[5] !== undefined ? a[5] : a[2], dh = a[6] !== undefined ? a[6] : a[3];
        if (sw === 256 && sh === 256) { C.draw.chunk256++; C.draw.chunk256ms += ms; }
        else if (dw >= C.viewW - 4 && dh >= C.viewH - 4) { C.draw.full++; C.draw.fullMs += ms; }
        else { C.draw.other++; C.draw.otherMs += ms; }
      }
    };
    const cc = Object.getPrototypeOf(g.renderer.chunks ?? g.renderer) ?? null;
    // ChunkCache 原型: bakeChunkInto 计数
    let protoCC = null;
    try { protoCC = Object.getPrototypeOf(g.renderer.chunks); } catch { }
    if (!protoCC) {
      // chunks 是私有字段——从 render 侧拿不到则走 world 侧? 兜底: 全局找 ChunkCache 实例
      protoCC = null;
    }
    if (protoCC) {
      const ob = protoCC.bakeChunkInto;
      if (typeof ob === 'function') protoCC.bakeChunkInto = function (...a) {
        const t0 = performance.now();
        try { return ob.apply(this, a); } finally { C.bakes++; C.bakeMs += performance.now() - t0; }
      };
      const og = protoCC.get;
      if (typeof og === 'function') protoCC.get = function (...a) { C.get++; return og.apply(this, a); };
    }
    const wwc = Object.getPrototypeOf(g.renderer.waterWarp);
    const oe = wwc.endFgPass;
    wwc.endFgPass = function (...a) {
      const t0 = performance.now();
      try { return oe.apply(this, a); } finally { C.fgBlit++; C.fgMs += performance.now() - t0; }
    };
    const ow = wwc.applyFullScreen;
    if (typeof ow === 'function') wwc.applyFullScreen = function (...a) { C.warpN++; return ow.apply(this, a); };
    return { ok: true, chunkProtoFound: !!protoCC, viewW: C.viewW, viewH: C.viewH };
  });
  L.chk('counters', ok.ok, JSON.stringify(ok));

  // 找水
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
    return { runs, px: g.player.x, gl };
  });

  await page.evaluate(function swPerfBj77Walk() {
    const P = window.__swPerfBj77Walk = { on: false, tps: 0, dir: 1, last: 0 };
    function tick(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick); return; }
      const g = window.__swGame;
      if (g?.player) { const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0; g.player.x += P.tps * 16 * dt * P.dir; g.player.vy = 0; }
      P.last = now; requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const setWalk = (on, tps, dir) => page.evaluate((c) => { const P = window.__swPerfBj77Walk; P.on = c.on; P.tps = c.tps; P.dir = c.dir; P.last = 0; }, { on, tps, dir });
  const resetC = () => page.evaluate(() => { const C = window.__swPerfBj77C; C.draw.chunk256 = 0; C.draw.chunk256ms = 0; C.draw.full = 0; C.draw.fullMs = 0; C.draw.other = 0; C.draw.otherMs = 0; C.bakes = 0; C.bakeMs = 0; C.get = 0; C.fgBlit = 0; C.fgMs = 0; C.warpN = 0; });

  const phase = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    await resetC();
    await sleep(ms);
    const c = await page.evaluate(() => {
      const C = window.__swPerfBj77C;
      return JSON.parse(JSON.stringify({ draw: C.draw, bakes: C.bakes, bakeMs: +C.bakeMs.toFixed(1), get: C.get, fgBlit: C.fgBlit, fgMs: +C.fgMs.toFixed(1), warpN: C.warpN }));
    });
    const secs = ms / 1000;
    L.say(`[${name}] chunk256=${c.draw.chunk256} (${(c.draw.chunk256 / secs).toFixed(0)}/s, ${(c.draw.chunk256ms / secs).toFixed(2)}ms/s) full=${c.draw.full} (${(c.draw.full / secs).toFixed(0)}/s, ${(c.draw.fullMs / secs).toFixed(2)}ms/s) other=${c.draw.other} (${(c.draw.otherMs / secs).toFixed(2)}ms/s) bakes=${c.bakes}(${(c.bakes / secs).toFixed(1)}/s, ${c.bakeMs}ms) get=${c.get} fgBlit=${c.fgBlit}(${c.fgMs}ms) warp=${c.warpN}`);
  };

  await phase('still:surface', 4000);
  await phase('walk:surface', 5000, () => setWalk(true, 12, 1));
  await setWalk(false, 0, 1);
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await teleport(page, ((w0 + w1) / 2) * 16, water.gl * 16 - 48);
    await phase('still:water', 4000);
    await phase('walk:water', 5000, () => setWalk(true, 12, 1));
    await setWalk(false, 0, 1);
  }
  L.say('done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

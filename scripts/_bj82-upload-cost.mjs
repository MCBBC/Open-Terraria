// BJ82 调研探针 ③·GL 纹理上传真实耗时微基准(只读,零 src 触碰)
// 目标:texSubImage2D/texImage2D 的 CPU 侧阻塞耗时(worldLight+waterDistortion 上下文)
//      ——T3「12MB/帧上传」的带宽口径换算成 ms 口径,决定 chunk 级脏追踪的收益上限。
// 方法:实例级 monkey-patch gl.texSubImage2D/texImage2D(performance.now 计时,不改 src);
//      ★GPU 页禁 trace——此处只是方法计时包裹(BJ77 归因包裹同款先例),非 CPU profiler。
// 注意:计时含驱动 memcpy+提交队列,不含 GPU 侧采样;纹理上传通常 CPU 阻塞为主。
// 运行:SW_ORIGIN=http://localhost:5213 node tools/probe.mjs run scripts/_bj82-upload-cost.mjs --seed=05162020 --size=small
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await front(page);
  await sleep(1500);   // 等首帧渲染(GL 上下文建立)

  const inst = await page.evaluate(function bj82GlCostInstall() {
    const g = window.__swGame, r = g.renderer;
    const P = window.__bj82gl = { m: {}, on: false };
    const wrapCtx = (gl, tag) => {
      if (!gl) return false;
      for (const meth of ['texSubImage2D', 'texImage2D']) {
        const orig = gl[meth].bind(gl);
        gl[meth] = function (...a) {
          if (!P.on) return orig(...a);
          const t0 = performance.now();
          try { return orig(...a); }
          finally {
            // 判别:6 参=全幅 DOM 源(world 全幅/light 回退),9 参=WebGL2 带源(lightBand)
            const kind = a.length >= 9 ? '.band9' : a.length >= 6 ? '.full6' : '.other';
            const e = (P.m[tag + '.' + meth + kind] ??= { n: 0, ms: 0 });
            e.n++; e.ms += performance.now() - t0;
          }
        };
      }
      return true;
    };
    const out = {};
    try {
      const wl = r.worldLightLayer();
      out.worldLight = wrapCtx(wl?.gl, 'worldLight');
    } catch (e) { out.worldLight = String(e).slice(0, 80); }
    try {
      out.waterDistortion = wrapCtx(r.waterWarp?.gl?.gl, 'waterDistortion');
    } catch (e) { out.waterDistortion = String(e).slice(0, 80); }
    return out;
  });
  L.say('gl-wrap=' + JSON.stringify(inst));
  if (!inst.worldLight) { L.chk('worldLight-gl', false, 'worldLight GL 上下文未取到'); process.exit(2); }

  const setOn = (on) => page.evaluate((c) => { window.__bj82gl.on = c; }, on);
  const flush = (name) => page.evaluate((n) => {
    const P = window.__bj82gl;
    const rows = P.m; P.m = {};
    const out = {};
    for (const [k, v] of Object.entries(rows)) out[k] = { n: v.n, totalMs: +v.ms.toFixed(2), avgMs: v.n ? +(v.ms / v.n).toFixed(4) : 0 };
    return { name: n, rows: out };
  }, name);

  const seg = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    await setOn(true);
    await sleep(ms);
    await setOn(false);
    const r0 = await flush(name);
    const parts = Object.entries(r0.rows).map(([k, v]) => `${k}: n=${v.n} avg=${v.avgMs}ms total=${v.totalMs}ms`);
    L.say(`[${name}] ` + parts.join(' | '));
    return r0;
  };

  const walkInstall = () => page.evaluate(function bj82WalkInstall() {
    if (window.__bj82walk) return;
    const P = window.__bj82walk = { on: false, tps: 0, dir: 1, last: 0 };
    function tick(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick); return; }
      const g = window.__swGame;
      if (g?.player) {
        const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
        g.player.x += P.tps * 16 * dt * P.dir;
        g.player.vy = 0;
      }
      P.last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  await walkInstall();
  const setWalk = (on, tps, dir) => page.evaluate((c) => { const P = window.__bj82walk; P.on = c.on; P.tps = c.tps; P.dir = c.dir; P.last = 0; }, { on, tps, dir });

  await seg('still:surface', 6000);
  await seg('walk:surface', 7000, () => setWalk(true, 12, 1));
  await setWalk(false, 0, 1);
  const water = await page.evaluate(function bj82FindWater() {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const y0 = Math.max(0, gl - 30), y1 = Math.min(st.h - 1, gl + 12);
    const runs = [];
    let runStart = -1, runLen = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let cnt = 0;
      for (let y = y0; y <= y1; y++) if (st.liquid[y * st.w + x] > 0) cnt++;
      if (cnt >= 8) { if (runStart < 0) runStart = x; runLen++; }
      else if (runStart >= 0) { if (runLen >= 10) runs.push([runStart, runStart + runLen - 1]); runStart = -1; runLen = 0; }
    }
    if (runStart >= 0 && runLen >= 10) runs.push([runStart, runStart + runLen - 1]);
    runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - g.player.x) - Math.abs((b[0] + b[1]) / 2 - g.player.x));
    return { runs: runs.slice(0, 4), groundLevel: gl };
  });
  if (water.runs.length) {
    const [wx0, wx1] = water.runs[0];
    await teleport(page, ((wx0 + wx1) / 2) * 16, water.groundLevel * 16 - 48);
    await seg('still:water', 6000);
    await seg('walk:water', 7000, () => setWalk(true, 12, 1));
    await setWalk(false, 0, 1);
  } else {
    L.say('no-water-run: 水段跳过');
  }
  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

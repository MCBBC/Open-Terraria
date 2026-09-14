// ★BJ78 census 反常诊断:warpOn/isCpuRender/激活面 + 计数仪具栈捕获
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await bootstrap(page, process.env.SW_ORIGIN);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });

  const water = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = Math.max(0, gl - 30); y <= gl + 12; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) runs.push([rs, rs + rl - 1]); rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
  const [w0, w1] = water.runs[0];
  await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);
  await pump(page, 60, {});
  await front(page);

  const diag = await page.evaluate(async () => {
    const g = window.__swGame;
    const r = g.renderer;
    const WW = (await import('/src/render/WaterWaves.ts')).waterWaves;
    const m = await import('/src/render/WaterWaves.ts');
    m.ensureWaveTextures(r.atlas);
    // 计数仪具 + 栈捕获
    window.__alloc = { usp: 0, stacks: {} };
    const RealUSP = URLSearchParams;
    window.URLSearchParams = class extends RealUSP {
      constructor(...a) {
        super(...a);
        window.__alloc.usp++;
        const k = String(new Error().stack).split('\n')[2]?.trim().slice(0, 120) ?? '?';
        window.__alloc.stacks[k] = (window.__alloc.stacks[k] ?? 0) + 1;
      }
    };
    // 包裹计数(直接物证:这些函数每帧调几次)
    const counts = { sd: 0, uw: 0, cl: 0 };
    const oSD = WW.sampleDisplace.bind(WW);
    WW.sampleDisplace = (...a) => { counts.sd++; return oSD(...a); };
    const GWD = (await import('/src/render/GLWaterDistortion.ts')).GLWaterDistortion;
    const oUW = GWD.prototype.uploadWave;
    GWD.prototype.uploadWave = function (...a) { counts.uw++; return oUW.apply(this, a); };
    const oCL = r.compositeLight.bind(r);
    let clN = 0;
    return {
      isCpuRender: r.isCpuRender(),
      quality: WW.quality,
      texReady: m.waveTexReady(),
      warpActive: r.waterWarp ? r.waterWarp.active() : null,
      waveCss: !!r._waveCss,
      glDied: r.waterWarp?.glUnavailable?.() ?? null,
      viewW: r.canvas.width, viewH: r.canvas.height,
      playerTile: [Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)],
      note: 'wraps installed',
      countsRef: counts,
    };
  });
  L.say(`diag=${JSON.stringify(diag).slice(0, 400)}`);

  // 60 帧
  const res = await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    window.__alloc.usp = 0; window.__alloc.stacks = {};
    const iv = setInterval(() => {
      if (g.renderer.animTick - t0 >= 60) {
        clearInterval(iv);
        res({ usp: window.__alloc.usp, stacks: window.__alloc.stacks });
      }
    }, 25);
  }));
  const calls = await page.evaluate(() => {
    // counts 在闭包里拿不到——通过再包一层读;简化:重读 WW 上的标记
    return 'see-usp';
  });
  L.say(`60f usp=${res.usp} (${(res.usp / 60).toFixed(1)}/f)`);
  L.say(`usp-stacks=${JSON.stringify(res.stacks).slice(0, 900)}`);

  L.say('diag-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

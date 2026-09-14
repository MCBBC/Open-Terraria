// ★BJ78 追刀:sampleDisplace 为何 ≈0/帧(waveOn 参数/调用计数帧后读取)
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

  // 安装计数器,返回句柄对象挂 window(帧后可读)
  await page.evaluate(async () => {
    const g = window.__swGame;
    const r = g.renderer;
    const W = await import('/src/render/WaterWaves.ts');
    const V = await import('/src/render/VanillaLiquidRenderer.ts');
    const WW = W.waterWaves;
    window.__cnt = { sd: 0, sg: 0, dvl: [], inView: null };
    const oSD = WW.sampleDisplace.bind(WW);
    WW.sampleDisplace = (...a) => { window.__cnt.sd++; return oSD(...a); };
    const oSG = WW.sampleGlint.bind(WW);
    WW.sampleGlint = (...a) => { window.__cnt.sg++; return oSG(...a); };
    const oDVL = V.drawVanillaLiquids;
    V.drawVanillaLiquids = (...a) => {
      window.__cnt.dvl.push({ bg: a[9], waveOn: a[13], win: [a[4], a[5], a[6], a[7]] });
      if (window.__cnt.dvl.length > 8) window.__cnt.dvl.shift();
      return oDVL(...a);
    };
  });

  await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    window.__cnt.sd = 0; window.__cnt.sg = 0; window.__cnt.dvl = [];
    const iv = setInterval(() => {
      if (g.renderer.animTick - t0 >= 30) { clearInterval(iv); res(); }
    }, 25);
  }));

  const out = await page.evaluate(() => ({
    sd: window.__cnt.sd, sg: window.__cnt.sg,
    dvl: window.__cnt.dvl,
    inView: window.__swGame.renderer._waveLiquidInView,
    cam: { x: window.__swGame.renderer._waveCss?.camL, y: window.__swGame.renderer._waveCss?.camT, zoom: window.__swGame.renderer._waveCss?.cssZoom },
    p: [window.__swGame.player.cx, window.__swGame.player.cy],
  }));
  L.say(`30f: sampleDisplace=${out.sd} (${(out.sd / 30).toFixed(1)}/f) sampleGlint=${out.sg} inView=${out.inView}`);
  L.say(`cam=${JSON.stringify(out.cam)} player=${JSON.stringify(out.p)}`);
  for (const d of out.dvl.slice(-4)) L.say(`drawVanillaLiquids: bg=${d.bg} waveOn=${d.waveOn} win=${JSON.stringify(d.win)}`);

  L.say('diag2-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

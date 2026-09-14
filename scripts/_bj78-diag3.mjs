// ★BJ78 追刀 2:drawLiquids 调用时点实测 warpOn 五分腿
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

  await page.evaluate(async () => {
    const R = (await import('/src/render/Renderer.ts')).Renderer;
    const W = await import('/src/render/WaterWaves.ts');
    window.__legs = [];
    const proto = R.prototype;
    const oDL = proto.drawLiquids;
    proto.drawLiquids = function (...a) {
      const legs = {
        cpu: this.isCpuRender(),
        css: this._waveCss !== null,
        q: W.waterWaves.quality,
        tex: W.waveTexReady(),
        act: this.waterWarp.active(),
        mode: this.waterWarp.mode,
        glUn: this.waterWarp.glUnavailable(),
      };
      if (window.__legs.length < 6) window.__legs.push(legs);
      return oDL.apply(this, a);
    };
  });

  await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    const iv = setInterval(() => { if (g.renderer.animTick - t0 >= 20) { clearInterval(iv); res(); } }, 25);
  }));

  const legs = await page.evaluate(() => window.__legs);
  for (const l of legs.slice(0, 4)) L.say(`legs=${JSON.stringify(l)}`);
  L.say('diag3-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

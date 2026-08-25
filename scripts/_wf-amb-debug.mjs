import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sfx = g.sfx;
  const st = g.world.store;
  for (let x = 30; x <= 50; x++) {
    st.setTileSilent(x, 60, 1);
    st.setHalfBrick(x, 60, true);
    st.liquid[st.idx(x, 60)] = 200; st.liquidType[st.idx(x, 60)] = 1;
  }
  for (let x = 32; x <= 45; x++) { st.liquid[st.idx(x, 59)] = 255; st.liquidType[st.idx(x, 59)] = 1; }
  for (let x = 30; x <= 50; x++) st.setTileSilent(x, 75, 1);
  g.liquid.addWater(40, 60);
  // 手动调一次消费
  let manualErr = null;
  try { g.updateWaterfallAmbience(); } catch (e) { manualErr = String(e).slice(0, 200); }
  const h1 = g.startLoopSfx('Waterfall_0.wav', 0.5, 0.5);
  return {
    ctxState: sfx.ctxState ? sfx.ctxState() : (sfx.ctx ? sfx.ctx.state : 'no-ctx-access'),
    hasCtx: !!sfx.ctx || !!sfx.ensure,
    amb: g.renderer.waterfalls.ambienceState(),
    wfLoopAfterManual: g.wfAmbLoops?.wf ? { playing: g.wfAmbLoops.wf.playing, dead: g.wfAmbLoops.wf.dead } : null,
    manualErr,
    testLoop: h1 ? { playing: h1.playing, dead: h1.dead } : null,
    suppress: sfx.suppress,
    tick: g.tickCount,
  };
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);

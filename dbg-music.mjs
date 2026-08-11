import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const wt = w.weather;
  return {
    windSpeedTarget: wt.windSpeedTarget, windSpeedCurrent: wt.windSpeedCurrent,
    cloudAlpha: wt.cloudAlpha, raining: wt.raining,
    windyGate: wt.shouldUseWindyDayMusic, stormGate: wt.shouldUseStormMusic,
    timeOfDay: w.clock.timeOfDay, bloodMoon: w.clock.bloodMoon,
    lastMusic: g.lastMusic, curMusic: g.cb ? 'n/a' : 'n/a',
    audioCur: window.__swAudio ? window.__swAudio.curMusic : null,
    gatesFn: typeof wt.updateMusicGates,
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();

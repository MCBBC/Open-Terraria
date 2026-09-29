// audioAcc 动态测量（前台稳态;诊断 _bgsfx-probe B0 读数 1.0696 恒定之谜）
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5262';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await gotoApp(page, ORIGIN, { tries: 30 });
await waitForBridge(page);
const [W, H] = sizeDims('small');
await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: '05162020', w: W, h: H });
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g && g.world && g.player && !g.entryFreezeActive && g.tickCount > 60 && !g.paused;
}, { timeout: 120000 });
const out = [];
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 700));
  out.push(await page.evaluate(() => ({
    tick: window.__swGame.tickCount,
    acc: Math.round(window.__swGame.audioAcc * 1e5) / 1e5,
    rainPlaying: window.__swGame.sfx.cueLayers.rain.cue.playing,
  })));
}
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
await main();
async function main() {}

// ★翼扑探针调试版:装翼后逐 tick dump 全飞行态字段,诊断为何未起飞
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.error('PAGEERROR:', String(e.message).slice(0, 160)));
await bootstrap(page, ORIGIN + '?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const iid = window.__swFlow.itemByVid(492);
  p.inv.armor[3] = { id: iid, stack: 1 };
  g.input.setVirtualAction('Jump', true);
  const ticks = [];
  for (let t = 0; t < 80; t++) {
    window.__vnow = (window.__vnow || performance.now()) + 16.6667;
    g.frame(window.__vnow);
    if (t % 2) continue;
    ticks.push({
      t, x: Math.round(p.x), y: Math.round(p.y),
      wf: p.wingFrame, vy: +p.vy.toFixed(2), wt: Math.round(p.wingTime * 10) / 10,
      jh: p.jumpHold, ground: p.onGround, water: p.inWater,
      iJ: p.inputJump, ui: g.input.uiBlocking, va: [...g.input.virtualActions],
      wing: p.equipStats?.wing?.logic ?? null, hidden: p.equipStats?.wing?.hidden ?? null,
    });
  }
  return { head: ticks.slice(0, 12), mid: ticks.slice(14, 24), tail: ticks.slice(-6) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);

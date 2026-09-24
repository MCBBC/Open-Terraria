// 一次性诊断④：clock 单位真值(freezeClock tod=0.5 后读 clockInfo+timeOfDay 原始值)
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { freezeClock, clockInfo } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  await bootstrap(page, ORIGIN);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  const r1 = await freezeClock(page, { tod: 0.5 });
  const i1 = await clockInfo(page);
  const raw = await page.evaluate(() => {
    const c = window.__swGame.world.clock;
    return { timeOfDay: c.timeOfDay, isDay: c.isDay, vanillaMainTime: c.vanillaMainTime?.() };
  });
  console.log(JSON.stringify({ r1, i1, raw }, null, 1));
} finally { await closeAllBrowsers().catch(() => {}); }

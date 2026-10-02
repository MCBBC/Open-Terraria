// 一次性诊断:tVis 在 manual g.frame 驱动下是否推进
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 1 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/entities/Enemy.ts');
  const st = { paused: g.paused, lastTime: g.lastTime, acc: g.acc, tick0: m.visEffectFrames() };
  const v0 = performance.now();
  for (let i = 0; i < 20; i++) { window.__vnow = (window.__vnow ?? v0) + 16.6667; g.frame(window.__vnow); }
  st.tick20 = m.visEffectFrames();
  st.lastTimeAfter = g.lastTime;
  st.accAfter = g.acc;
  st.vnow = window.__vnow;
  st.pausedAfter = g.paused;
  return st;
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);

#!/usr/bin/env node
// S1 残量 epf 归属:列出快照中与战斗扫掠带(x 560-1040, y 330-570)相交的 rect 身份。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const log = (...a) => console.log('[epf-band]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await new Promise((r) => setTimeout(r, 600));
    // 触发一次快照
    await page.evaluate(() => { const g = window.__swGame; g['inpOverDomUi'](); });
    await new Promise((r) => setTimeout(r, 1200));
    const res = await page.evaluate(() => {
      const g = window.__swGame;
      const rects = g['_domUiRects'] ?? [];
      const band = { l: 560, t: 330, r: 1040, b: 570 };
      const hit = [];
      for (const q of rects) {
        if (q.r < band.l - 1 || q.l > band.r + 1 || q.b < band.t - 1 || q.t > band.b + 1) continue;
        // 找 rect 所属元素:全屏 elementsFromPoint 在 rect 中心
        const cx = (q.l + q.r) / 2, cy = (q.t + q.b) / 2;
        const el = document.elementFromPoint(cx, cy);
        hit.push({ rc: `${Math.round(q.l)},${Math.round(q.t)},${Math.round(q.r - q.l)}x${Math.round(q.b - q.t)}`, el: el ? (el.className || el.tagName).toString().slice(0, 40) : 'null' });
      }
      return { rectsN: rects.length, bandHits: hit };
    });
    log(JSON.stringify(res, null, 1));
    await page.close().catch(() => {});
    process.exitCode = 0;
  } finally {
    await closeAllBrowsers().catch(() => {});
  }
};

try {
  await main();
} catch (e) {
  console.error('[epf-band] FAIL', e?.stack ?? e);
  process.exit(1);
}

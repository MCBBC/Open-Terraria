#!/usr/bin/env node
// 亚像素失配取证:失败角点 elementsFromPoint 全栈 + slot 精确 gBCR + 容器 transform。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const log = (...a) => console.log('[epf-sub]', ...a);

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
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 800));

    const res = await page.evaluate(() => {
      const out = { dpr: window.devicePixelRatio };
      const slots = [...document.querySelectorAll('.sw-vinv .sw-slot')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0;
      }).slice(0, 4);
      out.slots = slots.map((e) => {
        const r = e.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width };
      });
      // 失败角点:slot1 右下角外推 (+2,+0)/(+0,+2)/(+2,+2)
      const s1 = out.slots[0];
      const probePts = [[s1.r + 2, s1.b], [s1.r, s1.b + 2], [s1.r + 2, s1.b + 2], [s1.r + 0.5, s1.b + 0.5]];
      out.probes = probePts.map(([x, y]) => {
        const stack = document.elementsFromPoint(x, y).slice(0, 5).map((e) => {
          const r = e.getBoundingClientRect();
          return `${(e.className || e.tagName).toString().slice(0, 30)} pe=${getComputedStyle(e).pointerEvents} rc=${Math.round(r.left * 100) / 100},${Math.round(r.top * 100) / 100},${Math.round(r.width * 100) / 100}x${Math.round(r.height * 100) / 100}`;
        });
        return { x, y, stack };
      });
      // 容器 transform 链
      let chain = [];
      let p = slots[0];
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (cs.transform !== 'none' || cs.zoom !== '1') {
          chain.push(`${(p.className || p.tagName).toString().slice(0, 30)} transform=${cs.transform.slice(0, 60)} zoom=${cs.zoom}`);
        }
        p = p.parentElement;
      }
      out.transformChain = chain;
      return out;
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
  console.error('[epf-sub] FAIL', e?.stack ?? e);
  process.exit(1);
}

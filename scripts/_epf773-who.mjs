import { launchBrowser, openPage, closeAllBrowsers } from '/Users/vinlic/Project/GLM/SandboxWorld/game/tools/probe/lib/browser.mjs';
import { bootstrap } from '/Users/vinlic/Project/GLM/SandboxWorld/game/tools/probe/lib/boot.mjs';
import { createGame } from '/Users/vinlic/Project/GLM/SandboxWorld/game/tools/probe/lib/game.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    await bootstrap(page, ORIGIN);
    await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => { window.__swGame['inpOverDomUi'](); });
    await new Promise((r) => setTimeout(r, 1200));
    const res = await page.evaluate(() => {
      const sel = '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,.sw-ach-panel, .sw-res-panel, .sw-eqdock, .sw-vinv, .sw-summon-panel,.sw-npc-dialog, .sw-npc-shop, .sw-happy-panel, .sw-char-panel';
      const want = { l: 521, t: 451, w: 346, h: 389 };
      const out = [];
      const els = [...document.querySelectorAll(sel)];
      for (const m of els) {
        const pe = getComputedStyle(m).pointerEvents;
        const cand = pe === 'none' ? [...m.querySelectorAll('*')] : [m];
        for (const d of cand) {
          const r = d.getBoundingClientRect();
          if (Math.abs(r.left - want.l) < 3 && Math.abs(r.top - want.t) < 3 && Math.abs(r.width - want.w) < 6 && Math.abs(r.height - want.h) < 6) {
            out.push({ cls: (d.className || d.tagName).toString().slice(0, 60), pe: getComputedStyle(d).pointerEvents, display: getComputedStyle(d).display, rc: `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}`, z: getComputedStyle(d).zIndex });
          }
        }
      }
      return out;
    });
    console.log('[who]', JSON.stringify(res, null, 1));
    await page.close().catch(() => {});
    process.exitCode = 0;
  } finally { await closeAllBrowsers().catch(() => {}); }
};
await main().catch((e) => { console.error(e); process.exit(1); });

// BJ414 同族普查·classic 布局(?invlayout=legacy)关包态 HUD 普查——对拍 vanilla 布局面。
// 用法: SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs \
//         --timeout=240000 scripts/_bj414-legacy-census.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const log = (...a) => console.log('[bj414-classic]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN + '/?invlayout=legacy');
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 600 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    await page.evaluate(async () => {
      const g = window.__swGame;
      const { BuffType } = await import('/src/stats/Buffs.ts');
      g.player.buffs.apply(BuffType.Regen, 300);
      g.player.buffs.apply(BuffType.Ironskin, 300);
      g.player.buffs.apply(BuffType.Agility, 300);
    });
    await new Promise((r) => setTimeout(r, 1200));

    const out = await page.evaluate(async () => {
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const idOf = (el) => {
        if (!el) return '(null)';
        const r = el.getBoundingClientRect();
        const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        return `${el.tagName.toLowerCase()}${cls}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      };
      const groups = new Map();
      let total = 0, blocked = 0;
      for (let y = 0; y <= 250; y += 4) {
        for (let x = 0; x <= 560; x += 4) {
          total++;
          const el = document.elementFromPoint(x, y);
          if (!isDomUiTarget(el ?? null)) continue;
          blocked++;
          const k = idOf(el);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push([x, y]);
        }
      }
      return {
        total, blocked,
        groups: Array.from(groups.entries())
          .map(([k, pts]) => ({ el: k, pts: pts.length }))
          .sort((a, b) => b.pts - a.pts),
      };
    });
    log('classic CLOSED total', out.total, 'blocked', out.blocked);
    for (const gr of out.groups) console.log(`  ${String(gr.pts).padStart(5)}  ${gr.el}`);
  } finally {
    await closeAllBrowsers();
  }
};

try {
  await main();
} catch (e) {
  console.error('[bj414-classic] FAIL', e?.stack ?? e);
  process.exit(1);
}

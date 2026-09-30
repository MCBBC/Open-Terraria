// BJ414 变异对拍 spot 探针:buff 栏带小普查 + 关键点端到端（变异刀快速判别面）。
// 用法: SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs \
//         --timeout=180000 scripts/_bj414-spot.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const log = (...a) => console.log('[bj414-spot]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
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

    const census = await page.evaluate(async () => {
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      let total = 0, blocked = 0, blank = 0;
      const faces = new Map();
      for (let y = 70; y <= 150; y += 4) {
        for (let x = 26; x <= 456; x += 4) {
          total++;
          const el = document.elementFromPoint(x, y);
          if (!isDomUiTarget(el ?? null)) continue;
          blocked++;
          const r = el.getBoundingClientRect();
          const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).join('.') : '';
          const k = `${el.tagName.toLowerCase()}${cls}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
          faces.set(k, (faces.get(k) ?? 0) + 1);
        }
      }
      return { total, blocked, faces: Array.from(faces.entries()).sort((a, b) => b[1] - a[1]) };
    });
    log('buff-band census:', JSON.stringify(census));

    const e2e = [];
    for (const { label, px, py } of [
      { label: 'buff-blank(440,91)', px: 440, py: 91 },
      { label: 'buff-timespan(40,118)', px: 40, py: 118 },
      { label: 'buff-icon(40,90)', px: 40, py: 90 },
      { label: 'hotbar-gap(74,46)', px: 74, py: 46 },
    ]) {
      await page.mouse.move(px, py);
      await new Promise((r) => setTimeout(r, 80));
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 60));
      const held = await page.evaluate(() => window.__swGame.input.mouseHeld);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 60));
      e2e.push({ label, attackLive: held });
    }
    log('e2e:', JSON.stringify(e2e));
  } finally {
    await closeAllBrowsers();
  }
};

try {
  await main();
} catch (e) {
  console.error('[bj414-spot] FAIL', e?.stack ?? e);
  process.exit(1);
}

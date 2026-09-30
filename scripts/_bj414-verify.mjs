// BJ414 收官验证:修复态全视口普查 + buff 栏交互回归(悬停气泡/右键取消) + 端到端 + 截图留档。
// 用法: SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs \
//         --timeout=240000 scripts/_bj414-verify.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const log = (...a) => console.log('[bj414-verify]', ...a);

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

    // 1) 全视口普查(修复态)
    const census = await page.evaluate(async () => {
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const W = window.innerWidth, H = window.innerHeight;
      const groups = new Map();
      let total = 0, blocked = 0;
      for (let y = 0; y <= H - 4; y += 8) {
        for (let x = 0; x <= W - 4; x += 8) {
          total++;
          const el = document.elementFromPoint(x, y);
          if (!isDomUiTarget(el ?? null)) continue;
          blocked++;
          const r = el.getBoundingClientRect();
          const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).join('.') : '';
          const k = `${el.tagName.toLowerCase()}${cls}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
          groups.set(k, (groups.get(k) ?? 0) + 1);
        }
      }
      return { total, blocked, containerFaces: Array.from(groups.entries()).filter(([k]) => !k.includes('@') || true)
        .filter(([k]) => !/img|span|slot|btn|advisor|glyph|trash|bdr|ttl/.test(k)) };
    });
    log('census(修复态):', JSON.stringify(census));

    // 2) buff 栏交互回归:悬停图标→气泡出现;右键→buff 移除
    const icon = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.sw-buff img'));
      const r = imgs[0]?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });
    if (icon) {
      await page.mouse.move(icon.x, icon.y);
      await new Promise((r) => setTimeout(r, 350));
      const tip = await page.evaluate(() => {
        const t = document.querySelector('.sw-tooltip');
        return { visible: !!t && t.style.display !== 'none' && (t.textContent ?? '').length > 0, text: (t?.textContent ?? '').slice(0, 40) };
      });
      log('hover tooltip:', JSON.stringify(tip));
      const before = await page.evaluate(() => window.__swGame.player.buffs.active.size);
      await page.mouse.click(icon.x, icon.y, { button: 'right' });
      await new Promise((r) => setTimeout(r, 400));
      const after = await page.evaluate(() => window.__swGame.player.buffs.active.size);
      log(`rightclick remove: ${before} -> ${after} (vanilla TryRemovingBuff 非 debuff 可右键)`);
    }

    // 3) 端到端:空白攻击通电 + 图标占用
    const e2e = [];
    for (const { label, px, py } of [
      { label: 'buff-blank(440,91)', px: 440, py: 91 },
      { label: 'buff-blank-row2(300,140)', px: 300, py: 140 },
      { label: 'buff-timespan(40,118)', px: 40, py: 118 },
      { label: 'buff-icon(40,90)', px: 40, py: 90 },
      { label: 'hotbar-gap(74,46)', px: 74, py: 46 },
      { label: 'hotbar-slot(40,46)', px: 40, py: 46 },
      { label: 'world-far(640,480)', px: 640, py: 480 },
    ]) {
      await page.mouse.move(px, py);
      await new Promise((r) => setTimeout(r, 80));
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 60));
      const held = await page.evaluate(() => window.__swGame.input.mouseHeld);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 80));
      e2e.push({ label, attackLive: held });
    }
    log('e2e:', JSON.stringify(e2e));

    await page.screenshot({ path: 'docs/evidence/bj414/after-fix-hud.png' });
    log('screenshot docs/evidence/bj414/after-fix-hud.png');
  } finally {
    await closeAllBrowsers();
  }
};

try {
  await main();
} catch (e) {
  console.error('[bj414-verify] FAIL', e?.stack ?? e);
  process.exit(1);
}

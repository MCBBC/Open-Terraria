// BJ414 定谳探针 v2:关包/开包两态 × HUD 区域逐点普查——每点 elementFromPoint +
// isDomUiTarget,按【拦截元素】分组量化「容器空白拦截」病灶面;附真实 mousedown 端到端。
// 用法: SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs \
//         --timeout=240000 scripts/_bj414-hitfaces.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const log = (...a) => console.log('[bj414]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 600 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    // 挂 3 个 buff(恢复/铁皮/敏捷)让 buff 栏有真实图标
    await page.evaluate(async () => {
      const g = window.__swGame;
      const { BuffType } = await import('/src/stats/Buffs.ts');
      g.player.buffs.apply(BuffType.Regen, 300);
      g.player.buffs.apply(BuffType.Ironskin, 300);
      g.player.buffs.apply(BuffType.Agility, 300);
    });
    await new Promise((r) => setTimeout(r, 1200));

    const scanPage = () => page.evaluate(async () => {
      const g = window.__swGame;
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const W = window.innerWidth, H = window.innerHeight;
      // 全视口普查(同族普查面):8px 网格
      const X0 = 0, X1 = W - 4, Y0 = 0, Y1 = H - 4, STEP = 8;
      const idOf = (el) => {
        if (!el) return '(null)';
        const r = el.getBoundingClientRect();
        const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        return `${el.tagName.toLowerCase()}${cls}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      };
      const groups = new Map();
      let total = 0, blocked = 0;
      for (let y = Y0; y <= Y1; y += STEP) {
        for (let x = X0; x <= X1; x += STEP) {
          total++;
          const el = document.elementFromPoint(x, y);
          if (!isDomUiTarget(el ?? null)) continue;
          blocked++;
          const k = idOf(el);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push([x, y]);
        }
      }
      // per-tick 门(Game.updateUse 消费面)同点采样
      const inpProbe = (x, y) => {
        const i = g.input;
        i.mouseX = x; i.mouseY = y;
        g['_domUiRectsTick'] = -999;
        return g['inpOverDomUi']();
      };
      return {
        total, blocked,
        groups: Array.from(groups.entries())
          .map(([k, pts]) => ({ el: k, pts: pts.length, sample: pts.slice(0, 3) }))
          .sort((a, b) => b.pts - a.pts),
        inpBuffBlank: inpProbe(440, 91),
        inpBuffIcon: inpProbe(40, 90),
        inpBuffBlank2: inpProbe(300, 140),
        inpHotbarGap: inpProbe(74, 46),
        inpHotbarSlot: inpProbe(40, 46),
      };
    });

    log('== CLOSED state (hotbar+buffBar) ==');
    const closed = await scanPage();
    log(JSON.stringify(closed, null, 1));

    // 开包态(vinv 布局)
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 700));
    const openState = await page.evaluate(() => document.querySelector('.sw-vinv')?.style.display === 'block');
    log('== OPEN state (vinv display=' + openState + ') ==');
    if (openState) {
      const opened = await scanPage();
      log(JSON.stringify(opened, null, 1));
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 400));
    }

    // 端到端 CDP 真实 mousedown:buff 栏空白 vs 世界远处 vs 热键栏槽间缝
    const e2e = [];
    for (const { label, px, py } of [
      { label: 'buff-icon(40,90)', px: 40, py: 90 },
      { label: 'buff-blank(440,91)', px: 440, py: 91 },
      { label: 'buff-blank(300,140)', px: 300, py: 140 },
      { label: 'hotbar-gap(74,46)', px: 74, py: 46 },
      { label: 'hotbar-slot(40,46)', px: 40, py: 46 },
      { label: 'world-far(640,480)', px: 640, py: 480 },
    ]) {
      await page.mouse.move(px, py);
      await new Promise((r) => setTimeout(r, 100));
      const before = await page.evaluate(() => [window.__swGame.input.mouseHeld, window.__swGame.input.mouseDown]);
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 80));
      const during = await page.evaluate(() => [window.__swGame.input.mouseHeld, window.__swGame.input.mouseDown]);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 80));
      e2e.push({ label, before, during });
    }
    log('e2e mousedown during=true=>攻击链通电:', JSON.stringify(e2e));

    await page.screenshot({ path: 'docs/evidence/bj414/probe-hitfaces.png' });
    log('screenshot saved docs/evidence/bj414/probe-hitfaces.png');
  } finally {
    await closeAllBrowsers();
  }
};

try {
  await main();
} catch (e) {
  console.error('[bj414] FAIL', e?.stack ?? e);
  process.exit(1);
}

#!/usr/bin/env node
// 开包态等价失配诊断:抓 mismatch 点 + ref 命中元素身份 + 是否在快照 rect 内。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const log = (...a) => console.log('[epf-open]', ...a);

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

    const res = await page.evaluate(async () => {
      const g = window.__swGame;
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const inp = g.input;
      const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      const rect = cv.getBoundingClientRect();
      const rl = typeof inp['rectLeft'] === 'number' ? inp['rectLeft'] : rect.left;
      const rt = typeof inp['rectTop'] === 'number' ? inp['rectTop'] : rect.top;
      const ref = (cx, cy) => {
        const el = document.elementFromPoint(Math.max(0, cx), Math.max(0, cy));
        return { hit: isDomUiTarget(el ?? null), cls: el ? (el.className || el.tagName).toString().slice(0, 50) : 'null' };
      };
      const pts = [];
      const W = window.innerWidth, H = window.innerHeight;
      for (let x = 4; x < W; x += Math.max(10, Math.floor(W / 40))) {
        for (let y = 4; y < H; y += Math.max(10, Math.floor(H / 24))) pts.push([x, y]);
      }
      for (const q of (g['_domUiRects'] ?? [])) {
        for (const d of [2, 0, -2]) {
          pts.push([Math.max(0, q.l + d), Math.max(0, q.t)]);
          pts.push([Math.max(0, q.r + d), Math.max(0, q.b)]);
        }
      }
      const inAnyRect = (cx, cy) => (g['_domUiRects'] ?? []).some((q) => cx >= q.l && cx <= q.r && cy >= q.t && cy <= q.b);
      const sel = '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,' +
        '.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,' +
        '.sw-ach-panel, .sw-res-panel, .sw-eqdock, .sw-vinv, .sw-summon-panel,' +
        '.sw-npc-dialog, .sw-npc-shop, .sw-happy-panel, .sw-char-panel';
      const diag = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        let chain = [];
        let p = el;
        for (let i = 0; i < 4 && p && p !== document.body; i++) {
          chain.push((p.className || p.tagName).toString().slice(0, 30) + '|pe=' + getComputedStyle(p).pointerEvents);
          p = p.parentElement;
        }
        return {
          cls: (el.className || el.tagName).toString().slice(0, 40),
          rc: `${Math.round(r.left * 10) / 10},${Math.round(r.top * 10) / 10} ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`,
          pe: getComputedStyle(el).pointerEvents,
          member: el.matches(sel),
          chain: chain.join(' < '),
        };
      };
      const mism = [];
      for (const [cx, cy] of pts) {
        inp.mouseX = cx - rl; inp.mouseY = cy - rt;
        const got = g['inpOverDomUi']();
        const el = document.elementFromPoint(Math.max(0, cx), Math.max(0, cy));
        const want = isDomUiTarget(el ?? null);
        if (got !== want) {
          if (mism.length < 8) mism.push({ cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10, got, want, inRect: inAnyRect(cx, cy), el: diag(el) });
        }
      }
      return { checked: pts.length, mismN: mism.length, rectsN: (g['_domUiRects'] ?? []).length, tickCount: g.tickCount, rectsTick: g['_domUiRectsTick'], mism };
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
  console.error('[epf-open] FAIL', e?.stack ?? e);
  process.exit(1);
}

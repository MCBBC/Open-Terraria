#!/usr/bin/env node
// elementFromPoint 修法定档探针:PE-none 成员子树 walk 成本 + 可命中面覆盖三态普查。
// 用法: SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs \
//         --timeout=280000 scripts/_epf773-walkcost.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const log = (...a) => console.log('[epf-walk]', ...a);

const AUDIT = () => {
  const sel = '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,' +
    '.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,' +
    '.sw-ach-panel, .sw-res-panel, .sw-eqdock, .sw-vinv, .sw-summon-panel,' +
    '.sw-npc-dialog, .sw-npc-shop, .sw-happy-panel, .sw-char-panel';
  const members = [...document.querySelectorAll(sel)];
  const peNone = [], peAuto = [];
  for (const m of members) {
    const pe = getComputedStyle(m).pointerEvents;
    const rc = m.getBoundingClientRect();
    (pe === 'none' ? peNone : peAuto).push({
      cls: (m.className || '').toString().slice(0, 40),
      rc: `${Math.round(rc.left)},${Math.round(rc.top)} ${Math.round(rc.width)}x${Math.round(rc.height)}`,
    });
  }
  // PE-none 成员子树规模与 walk 成本(5 次均值;首走含样式重算)
  let nodes = 0, autoN = 0; const autoSamples = [];
  const t0 = performance.now();
  for (const m of peNone.map((x) => members.find((e) => (e.className || '').toString().startsWith(x.cls.split(' ')[0]))).filter(Boolean)) {
    if (m.getBoundingClientRect().width <= 0 && m.getBoundingClientRect().height <= 0) continue; // display:none
    for (const e of m.querySelectorAll('*')) {
      nodes++;
      if (getComputedStyle(e).pointerEvents === 'auto') {
        const rc = e.getBoundingClientRect();
        if (rc.width > 0 && rc.height > 0) {
          autoN++;
          if (autoSamples.length < 12) autoSamples.push({ cls: (e.className || '').toString().slice(0, 44), rc: `${Math.round(rc.left)},${Math.round(rc.top)} ${Math.round(rc.width)}x${Math.round(rc.height)}` });
        }
      }
    }
  }
  const walkMs = performance.now() - t0;
  let walkMs2 = 0;
  for (let k = 0; k < 4; k++) {
    const t = performance.now();
    for (const m of members) {
      if (getComputedStyle(m).pointerEvents !== 'none') continue;
      const rc = m.getBoundingClientRect();
      if (rc.width <= 0 && rc.height <= 0) continue;
      for (const e of m.querySelectorAll('*')) if (getComputedStyle(e).pointerEvents === 'auto') e.getBoundingClientRect();
    }
    walkMs2 += performance.now() - t;
  }
  // 现行快照成本(对照)
  const ts = performance.now();
  for (const m of members) m.getBoundingClientRect();
  const snapMs = performance.now() - ts;
  return {
    membersN: members.length, peNone, peAuto: peAuto.slice(0, 14),
    walkNodes: nodes, walkAuto: autoN, autoSamples,
    walkMsFirst: +walkMs.toFixed(2), walkMsAvg: +(walkMs2 / 4).toFixed(2), memberSnapMs: +snapMs.toFixed(2),
  };
};

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    await page.setViewport({ width: 1600, height: 900 });
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await new Promise((r) => setTimeout(r, 600));
    log('combat(关包):', JSON.stringify(await page.evaluate(AUDIT)));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));
    log('inventory(开包):', JSON.stringify(await page.evaluate(AUDIT)));
    await page.close().catch(() => {});
    process.exitCode = 0;
  } finally {
    await closeAllBrowsers().catch(() => {});
  }
};

try {
  await main();
} catch (e) {
  console.error('[epf-walk] FAIL', e?.stack ?? e);
  process.exit(1);
}

// ★红队 fix-up 2:hideInfo 点击链(手动 down/帧/up 消除 puppeteer 0ms 点击竞态)。
import { launchBrowser, openPage, closeAllBrowsers, front } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, installPinnedRandom } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5278';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}  ${detail}`); }
  else { fail++; console.log(`FAIL: ${name}  ${detail}`); }
};

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
  await page.goto(ORIGIN + '/?infodom=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  installPinnedRandom(page, 913);
  const boot = await bootstrap(page, ORIGIN);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  await godMode(page, true);
  await page.evaluate(async () => {
    for (let i = 0; i < 60 && !(window.__swFlow?.itemByVid && window.__swGame?.player?.inv?.armor); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const g = window.__swGame;
    const vid = [3124, 5358, 3123].find((v) => window.__swFlow.itemByVid(v) != null);
    g.player.inv.armor[3] = { id: window.__swFlow.itemByVid(vid), stack: 1 };
  });
  await front(page);
  await sleep(1000);
  // 先开一次背包(rebuild 让图标 src 落位)再关——F1/F3 前置
  await page.keyboard.press('Escape'); await sleep(900);
  await page.keyboard.press('Escape'); await sleep(900);

  // T1 悬停委托(横排图标已实渲染)
  await page.keyboard.press('Escape'); await sleep(900);
  const box = await page.evaluate(() => {
    const ic = document.querySelector('.sw-infoaccs .sw-inf-row img');
    const r = ic.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, display: ic.style.display, src: !!ic.getAttribute('src') };
  });
  await page.mouse.move(box.x, box.y); await sleep(100);
  await page.mouse.move(box.x + 1, box.y); await sleep(400);
  const t1 = await page.evaluate(() => window.__swGame.renderer.infoAccHover);
  ok('T1 DOM 悬停委托命中(横排)', t1 >= 0 && box.display === 'block' && box.src, `hover=${t1} box=${JSON.stringify(box)}`);

  // T2 hideInfo 点击:down→2 帧→up(消除 0ms 竞态)
  const pre = await page.evaluate(() => {
    const g = window.__swGame;
    const row = g.renderer.infoAccs.state.rows?.[0];
    return { hideIndex: row?.hideIndex ?? -1, before: row ? g.player.hideInfo[row.hideIndex] : null };
  });
  await page.mouse.move(box.x, box.y); await sleep(250);
  await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(500);
  const post = await page.evaluate((hi) => window.__swGame.player.hideInfo[hi], pre.hideIndex);
  ok('T2 hideInfo 点击翻转', pre.hideIndex >= 0 && post !== pre.before, `${pre.before}→${post}`);
  if (post !== pre.before) { await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(400); }

  // T3 纵排图标稳态核查(rebuild 后回纵排,图标应保持可见)
  await page.keyboard.press('Escape'); await sleep(900);
  const t3 = await page.evaluate(() => {
    const ics = [...document.querySelectorAll('.sw-infoaccs .sw-inf-row img')];
    return { rows: ics.length, withSrc: ics.filter((i) => i.getAttribute('src') && i.style.display === 'block').length };
  });
  ok('T3 纵排图标稳态渲染', t3.rows >= 8 && t3.withSrc === t3.rows, JSON.stringify(t3));

  ok('零页面错误', errs.length === 0, errs.slice(0, 2).join('|'));
  console.log(`TOTAL: ${pass} pass / ${fail} fail`);
} finally {
  await closeAllBrowsers();
}

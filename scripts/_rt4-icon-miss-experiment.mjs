// ★红队决定性翻转实验:InfoAccsDOM 图标 src「首申请即定,懒加载窗内 miss 永不重试」。
//   步骤:进世界(?infodom=1)+装全门禁饰品 → 不动任何布局 → 等 20s(纹理早已落地)
//   → 读各行 icon src/display(预期:仍 miss=缺陷坐实)→ 拨一次 Escape(开背包=横排
//   rebuild=强制重申请)→ 再读(预期:全亮=机制确认)→ 关背包 → 再读(预期:保持亮)。
import { launchBrowser, openPage, closeAllBrowsers, front } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, installPinnedRandom } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5278';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  await page.goto(ORIGIN + '/?infodom=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  installPinnedRandom(page, 913);
  const boot = await bootstrap(page, ORIGIN);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  console.log('boot/world:', boot.ok, gen.ok);
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
  await sleep(1500);

  const readIcons = (tag) => page.evaluate(async (t) => {
    const atlas = window.__swAtlas;
    // 纹理落地核查:UI_InfoIcon_0..13 经 ensureUiImage 懒加载,此处直读 uiimages 表
    const landed = [];
    for (let n = 0; n <= 13; n++) {
      const key = `UI_InfoIcon_${n}.png`;
      landed.push(!!atlas?.uiimages?.get?.(key));
    }
    const rows = [...document.querySelectorAll('.sw-infoaccs .sw-inf-row')];
    const iconState = rows.map((r) => {
      const ic = r.children[0];
      return { hasSrc: !!ic.getAttribute('src'), display: ic.style.display };
    });
    const withSrc = iconState.filter((s) => s.hasSrc && s.display === 'block').length;
    const pendingAtlas = !atlas || landed.filter(Boolean).length < 14;
    // 等 atlas 层纹理全落地再继续(最长 15s)
    for (let i = 0; i < 75 && pendingAtlas; i++) await new Promise((r) => setTimeout(r, 200));
    return { tag: t, rows: rows.length, withSrc, iconState: iconState.slice(0, 3), atlasLanded: landed.filter(Boolean).length };
  }, tag);

  const r1 = await readIcons('steady-20s');
  console.log('[steady]', JSON.stringify(r1));

  await page.keyboard.press('Escape');
  await sleep(1200);
  const r2 = await readIcons('inv-open-rebuild');
  console.log('[rebuild]', JSON.stringify(r2));

  await page.keyboard.press('Escape');
  await sleep(1200);
  const r3 = await readIcons('inv-close');
  console.log('[closed]', JSON.stringify(r3));

  const verdict = r1.atlasLanded >= 14 && r1.withSrc === 0 && r2.withSrc >= 12;
  console.log(verdict
    ? 'VERDICT: CONFIRMED — 纹理已落地但 steady 态 src 缺失(rebuild 后自愈) = 首申请 miss 永不重试'
    : `VERDICT: NOT CONFIRMED — steady=${r1.withSrc}/${r1.rows} landed=${r1.atlasLanded} rebuild=${r2.withSrc}`);
} finally {
  await closeAllBrowsers();
}

// IIII245 一次性诊断:世界内成就面板冒烟(挂载点 body 化后游戏内路径无回归——
// 面板打开、位于 HUD 之上、UI.closeAll 后无残留)。
import { launchBrowser, openPage, gotoApp, waitForBridge, createGame, front, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger({ label: 'III245-ach-ingame-smoke' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  L.chk('导航+桥', await gotoApp(page, process.env.SW_ORIGIN), 'gotoApp');
  L.chk('桥就绪', await waitForBridge(page, { timeout: 120_000 }));
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('建世界', gen.ok, gen.why ?? '');
  await front(page);
  await sleep(500);
  // 世界内直开成就面板(设置入口同款宿主:Game 级实例+sfx)
  const opened = await page.evaluate(async () => {
    const m = await import('/src/ui/AchievementsUI.ts');
    const g = window.__swGame;
    m.openAchievementsPanel({ achievements: g.achievements, sfx: g.sfx });
    await new Promise((r) => setTimeout(r, 300));
    const p = document.querySelector('.sw-ach-panel');
    if (!p) return { opened: false };
    const inRoot = !!p.closest('.sw-root');
    const top = document.elementFromPoint(
      p.getBoundingClientRect().left + p.getBoundingClientRect().width / 2,
      p.getBoundingClientRect().top + 40,
    );
    return { opened: true, inRoot, parent: p.parentElement?.tagName, topInPanel: !!top?.closest('.sw-ach-panel') };
  });
  L.chk('世界内面板打开', opened.opened === true, JSON.stringify(opened));
  L.chk('面板挂 body 顶层语境(不在 .sw-root 内)', opened.inRoot === false, `parent=${opened.parent}`);
  L.chk('面板位于世界 HUD 之上', opened.topInPanel === true);
  // UI.closeAll(退菜单路径)无残留
  await page.evaluate(() => { window.__swUI?.closeAll(); });
  await sleep(200);
  const residue = await page.evaluate(() => !!document.querySelector('.sw-ach-panel'));
  L.chk('closeAll 后无面板残留', residue === false);
  console.log(L.print());
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

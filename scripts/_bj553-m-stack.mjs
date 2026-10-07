/** BJ553-m:抓帧循环异常完整栈。 */
import { launchBrowser, openPage, bootstrap, createGame, pump, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails, consoleErrors: null });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('帧循环') || t.includes('Error') || msg.type() === 'error') {
      console.log('[console]', msg.type(), t.slice(0, 800));
    }
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e?.stack ?? e).slice(0, 900)));
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  console.log('bootstrap', JSON.stringify(boot).slice(0, 80));
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  console.log('createGame', JSON.stringify(gen).slice(0, 80));
  await pump(page, 10);
  const { giveItems, spawnEnemy } = await import('../tools/probe/lib/index.mjs');
  await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  const spot = await page.evaluate(() => { const g = window.__swGame; return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) }; });
  await spawnEnemy(page, 3, spot.x + 48, spot.y);
  await pump(page, 6);
  const tid = await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
    return g.player.minionTargetId;
  });
  console.log('tid set', tid);
  await new Promise((r) => setTimeout(r, 4000));
  console.log('survived');
} finally {
  await browser.close().catch(() => {});
}
process.exit(0);

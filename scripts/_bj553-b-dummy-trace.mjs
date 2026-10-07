/** BJ553-b:假人 488 进桶排查 + 僵尸 3 对照 + 门快照（缩小版）。 */
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 30);
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 100));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  for (const vid of [488, 3]) {
    const sp = await spawnEnemy(page, vid, spot.x + 80, spot.y);
    const snap0 = await page.evaluate(() => {
      const g = window.__swGame;
      const es = g.entities.enemies ?? [];
      return { n: es.length, vids: es.map((e) => e.vanillaId).slice(0, 6),
        dead: es.map((e) => e.dead).slice(0, 6), buckets: Object.keys(g.entities).slice(0, 14) };
    });
    L.say(`vid=${vid} spawn=${JSON.stringify(sp)} snap0=${JSON.stringify(snap0)}`);
    await pump(page, 6);
    const snap1 = await page.evaluate(() => {
      const g = window.__swGame;
      const es = g.entities.enemies ?? [];
      return { n: es.length, vids: es.map((e) => e.vanillaId).slice(0, 6) };
    });
    L.say(`vid=${vid} after pump6: ${JSON.stringify(snap1)}`);
    await clearEnemies(page);
  }
  // 僵尸在场时写槽+门快照
  const spz = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-z', spz.ok, JSON.stringify(spz).slice(0, 100));
  await pump(page, 2);
  const gate = await page.evaluate(`(() => import('/src/data/vanillaItemCombat.ts').then(async (cwMod) => {
    const { ITEM_DEFS } = await import('/src/data/items.ts?t=' + Date.now());
    const g = window.__swGame;
    const p = g.player;
    const held = p.inv.heldItem ? p.inv.heldItem() : p.inv.slots[p.inv.selected];
    const def = held ? ITEM_DEFS[held.id] : undefined;
    const cw = def ? cwMod.combatWeapon(def) : null;
    const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
    if (z) p.minionTargetId = z.id;
    let sheet = null, sheetW = null, sheetH = null;
    try {
      const s = g.renderer.atlas?.ensureVImage('vanilla/Extra_199.png');
      sheet = !!s; sheetW = s ? s.width : null; sheetH = s ? s.height : null;
    } catch (e) { sheet = 'throw:' + e.message; }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tidAfter = p.minionTargetId;
    return {
      dead: !!p.dead, tidAfter, kind: cw?.kind ?? null,
      inEnemies: z ? true : false, sheet, sheetW, sheetH,
      zPos: z ? { cx: Math.round(z.cx), cy: Math.round(z.cy), dead: z.dead } : null,
    };
  }))()`);
  L.say(`gate(zombie): ${JSON.stringify(gate)}`);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

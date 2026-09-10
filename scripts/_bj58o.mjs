/**
 * SW-BJ58 探针 O：tile 归属裁决。
 * 精灵世界位=地面行 ty≈266-268,与 type 145/319 地面 tile 同行——裁决实验:
 * ① 读 TILE_DEFS[145]/[319] 身份;
 * ② 拆除该带 tile(setTile 0)→ 精灵是否消失(=tile 渲染 hijack);
 * ③ 回填 → 精灵是否复现(A/B/A 闭环)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const ROWHIT = `(() => {
  const g = window.__swGame;
  const c2 = document.createElement('canvas');
  c2.width = 340; c2.height = 70;
  const cx = c2.getContext('2d', { willReadFrequently: true });
  cx.drawImage(g.renderer.canvas, 660, 370, 340, 70, 0, 0, 340, 70);
  const d = cx.getImageData(0, 0, 340, 70).data;
  let hit = 0;
  for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
  return hit;
})()`;

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
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);
  const h0 = await page.evaluate(ROWHIT);
  L.say(`装备态 rowBox=${h0}`);

  // ① tile 身份
  const ids = await page.evaluate(() => {
    const tiles = window.__swTiles ?? {};
    const defs = (id) => {
      const d = window.__swGame ? window.TILE_DEFS?.[id] : null;
      if (!d) return null;
      return { key: d.key, sheet: d.vanilla?.sheet, solid: d.solid };
    };
    return { t145: window.TILE_DEFS ? defs(145) : 'no TILE_DEFS global', t319: window.TILE_DEFS ? defs(319) : null };
  });
  L.say(`TILE_DEFS: ${JSON.stringify(ids)}`);

  // ② 拆地面行带 (tx 2104-2126, ty 264-268)
  const removed = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const removed = [];
    for (let ty = 263; ty <= 268; ty++) {
      for (let tx = 2104; tx <= 2126; tx++) {
        if (!st.inBounds(tx, ty)) continue;
        const si = st.idx(tx, ty);
        if (st.flags[si] & 1) {
          removed.push([tx, ty, st.type[si], st.frameX[si], st.frameY[si]]);
          st.setTile(tx, ty, 0);
        }
      }
    }
    return { n: removed.length, all: removed };
  });
  L.say(`拆除 ${removed.n} 格: ${JSON.stringify(removed.sample)}`);
  await pump(page, 6);
  for (let i = 0; i < 4; i++) await nextFrame(page);
  const h1 = await page.evaluate(ROWHIT);
  L.say(`拆除后 rowBox=${h1} (${h1 < Math.max(8, h0 * 0.4) ? '精灵随 tile 消失=tile 渲染面' : '仍在=非 tile 渲染'})`);

  // ③ 回填
  await page.evaluate((removed) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (const [tx, ty, type, fx, fy] of removed) {
      st.setTile(tx, ty, type);
      const si = st.idx(tx, ty);
      st.frameX[si] = fx; st.frameY[si] = fy;
    }
  }, removed.all);
  await pump(page, 6);
  for (let i = 0; i < 4; i++) await nextFrame(page);
  const h2 = await page.evaluate(ROWHIT);
  L.say(`回填后 rowBox=${h2}`);
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

/**
 * SW-BJ58 探针 B：定位"创造之物水平行"的数据面真身。
 * 行屏幕区域(上次实测):x 690-930, y 375-405 @cam(33650,4283) z=1 → 世界盒
 * x [33700,33940] y [4262,4292] → tile 盒 x [2106,2121] y [266,268]。
 * ① tile store 全通道 dump(判:真 tile/幽灵 tile/空);
 * ② 实体普查(enemies/drops/npcs/critters/props 在盒内的);
 * ③ ItemDrop 逐个 id/vid 反查(判:是不是一排掉落物)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, screenshot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

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

  await page.evaluate((iid) => {
    const g = window.__swGame;
    g.player.inv.armor[3] = { id: iid, stack: 1 };
    g.player.facing = 1;
    g.player.vx = 0; g.player.vy = 0;
  }, iid5126);
  await pump(page, 30, { clearEnemies: true });
  for (let i = 0; i < 3; i++) await nextFrame(page);

  const dump = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const cam = g.camera;
    const out = { cam: { x: cam.x, y: cam.y, zoom: cam.zoom }, player: { cx: g.player.cx, cy: g.player.cy, facing: g.player.facing } };
    // 屏幕盒→世界盒(用相机换算,和截图盒一致)
    const s2w = (sx, sy) => cam.screenToWorld(sx, sy);
    const [wx0, wy0] = s2w(680, 370);
    const [wx1, wy1] = s2w(940, 410);
    out.worldBox = { wx0, wy0, wx1, wy1 };
    const tx0 = Math.floor(wx0 / 16), ty0 = Math.floor(wy0 / 16);
    const tx1 = Math.floor(wx1 / 16), ty1 = Math.floor(wy1 / 16);
    out.tileBox = { tx0, ty0, tx1, ty1 };
    const cells = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!st.inBounds(tx, ty)) continue;
        const si = st.idx(tx, ty);
        if (st.flags[si] === 0 && st.type[si] === 0) continue;
        cells.push({ tx, ty, flags: st.flags[si], type: st.type[si], fx: st.frameX[si], fy: st.frameY[si], liquid: st.liquid[si], lt: st.liquidType[si], paint: st.paint[si], coat: st.coat ? st.coat[si] : null });
      }
    }
    out.tiles = cells;
    // 实体普查
    const kinds = ['enemies', 'drops', 'npcs', 'projectiles', 'props', 'critters'];
    out.ents = [];
    for (const k of kinds) {
      const arr = (g.entities ?? {})[k] ?? [];
      for (const e of arr) {
        if (!e || e.dead) continue;
        if (e.cx >= wx0 - 32 && e.cx <= wx1 + 32 && e.cy >= wy0 - 32 && e.cy <= wy1 + 32) {
          out.ents.push({ kind: k, x: e.cx, y: e.cy, itemId: e.itemId ?? null, stack: e.stack ?? null, w: e.w, h: e.h, ai0: e.ai0 });
        }
      }
    }
    // 全屏 critter/掉落物计数(判:行是不是恰好在屏内的自然刷虫)
    out.allDrops = (g.entities.drops ?? []).filter((d) => !d.dead).map((d) => ({ x: Math.round(d.cx), y: Math.round(d.cy), itemId: d.itemId, stack: d.stack }));
    out.allCritters = (g.entities.critters ?? []).filter((c) => !c.dead).map((c) => ({ x: Math.round(c.cx), y: Math.round(c.cy), w: c.w, h: c.h }));
    return out;
  });
  writeFileSync(`${OUT}/datab-face.json`, JSON.stringify(dump, null, 2));
  L.say(`tileBox=${JSON.stringify(dump.tileBox)} nonEmptyTiles=${dump.tiles.length} entsInBox=${dump.ents.length}`);
  L.say(`drops=${JSON.stringify(dump.allDrops)}`);
  L.say(`critters=${JSON.stringify(dump.allCritters)}`);
  if (dump.tiles.length) L.say(`tiles=${JSON.stringify(dump.tiles.slice(0, 40))}`);
  await screenshot(page, 'bj58b-row', { time: 'day', wx: dump.player.cx, wy: dump.player.cy, w: 110, h: 70, onDark: 'auto' });

  process.exit(L.exitCode());
} finally {
  await browser.close();
}

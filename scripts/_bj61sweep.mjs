// SW-BJ61 扫点：找出 sc.lookup 实际命中的瞄点几何（一次性）
import { launchBrowser, openPage, bootstrap, createGame, pump, giveItems, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const DY = 366;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  const pick = await giveItems(page, [{ vid: 3509, slot: 0 }], { select: 0 });
  L.chk('铜镐入槽', pick.ok, JSON.stringify(pick.failed));

  await page.evaluate((dy) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (let x = 40; x <= 90; x++) for (let y = 108 + dy; y <= 140 + dy; y++) {
      const i = st.idx(x, y);
      st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
      st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
    }
    for (let x = 42; x <= 88; x++) st.setTileSilent(x, 132 + dy, 1, 0, 0);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      st.setTileSilent(58 + i, 128 + dy + j, 21, i * 18, j * 18);
    }
    g.chunks.markDirtyArea(40, 108 + dy, 90, 140 + dy);
    const pl = g.player;
    pl.x = 54 * 16; pl.y = (132 + dy) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
    g.world.chests.push({ x: 58, y: 128 + dy, items: Array(40).fill(null), frame: 0 });
  }, DY);
  await pump(page, 60);

  // 扫点：每点设鼠标 + 泵 2 帧 + 读 sc
  await page.evaluate(() => { window.__swGame.input.keys.add('ControlLeft'); });
  const results = [];
  for (let dx = -3; dx <= 8; dx++) {
    for (let ddy = -5; ddy <= 2; ddy++) {
      const r = await page.evaluate(({ dx, ddy, dy }) => {
        const g = window.__swGame, c = g.camera;
        const tx = 54 + dx, ty = 132 + dy + ddy;
        g.input.mouseX = Math.round((tx * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
        g.input.mouseY = Math.round((ty * 16 + 8 - c.y) * c.zoom + c.viewH / 2);
        return { tx, ty };
      }, { dx, ddy, dy: DY });
      await pump(page, 2);
      const st = await page.evaluate(() => {
        const sc = window.__swGame.smartCursor;
        return { showing: sc.showing, x: sc.x, y: sc.y };
      });
      if (st.showing) results.push({ aim: [r.tx, r.ty], target: [st.x, st.y] });
    }
  }
  console.log('HITS', JSON.stringify(results));
  console.log('N=', results.length);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

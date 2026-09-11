// SW-BJ61 诊断：sc.showing=false 卡点定位（一次性）
import { launchBrowser, openPage, bootstrap, createGame, pump, giveItems, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const DY = 366;
const INSTALL = `
window.__dbg = () => {
  const g = window.__swGame, c = g.camera, inp = g.input, sc = g.smartCursor;
  const [mwx, mwy] = c.screenToWorld(inp.mouseX, inp.mouseY);
  const tx = Math.floor(mwx / 16), ty = Math.floor(mwy / 16);
  const st = g.world.store;
  const si = st.inBounds(tx, ty) ? st.idx(tx, ty) : -1;
  const held = g.player.inv.heldItem();
  return {
    sc: JSON.parse(JSON.stringify({ showing: sc.showing, x: sc.x, y: sc.y, wanted: sc.wanted })),
    gates: {
      uiBlocking: inp.uiBlocking, blockMouse: inp.blockMouse,
      inpOverDomUi: g.inpOverDomUi ? g.inpOverDomUi() : 'n/a',
      fullMap: g.renderer.fullMap.open, timeUiHover: g.renderer.timeUiHover,
      weatherUiHover: g.renderer.weatherUiHover, annotateMode: g.annotateMode,
      dead: g.player.dead,
    },
    keys: [...inp.keys],
    mouse: { mx: inp.mouseX, my: inp.mouseY, mwx, mwy, tx, ty },
    tile: si >= 0 ? { type: st.type[si], active: st.flags[si] & 1, wall: st.wall ? st.wall[si] : 'n/a' } : null,
    player: { x: g.player.x, y: g.player.y, cx: g.player.cx, cy: g.player.cy },
    cam: { x: c.x, y: c.y, zoom: c.zoom, viewW: c.viewW, viewH: c.viewH },
    held: held ? { id: held.id, def: held.id } : null,
    chestTiles: (() => {
      const out = [];
      for (let i = 58; i <= 59; i++) for (let j = 128 + ${DY}; j <= 129 + ${DY}; j++) {
        const k = st.idx(i, j);
        out.push([i, j, st.type[k], st.flags[k] & 1]);
      }
      return out;
    })(),
  };
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  const pick = await giveItems(page, [{ vid: 3509, slot: 0 }], { select: 0 });
  console.log('PICK', JSON.stringify(pick));
  await page.evaluate(INSTALL);
  await page.evaluate((dy) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (let x = 44; x <= 82; x++) for (let y = 114 + dy; y <= 134 + dy; y++) {
      const i = st.idx(x, y);
      st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
      st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
    }
    for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132 + dy, 1, 0, 0);
    g.chunks.markDirtyArea(44, 114 + dy, 82, 134 + dy);
    const pl = g.player;
    pl.x = 54 * 16; pl.y = (132 + dy) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
    g.world.chests.push({ x: 58, y: 128 + dy, items: Array(40).fill(null), frame: 0 });
  }, DY);
  await pump(page, 60);
  await page.evaluate((dy) => {
    const g = window.__swGame, c = g.camera;
    g.input.mouseX = Math.round((57 * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
    g.input.mouseY = Math.round((129 + dy) * 16 + 8 - c.y) * c.zoom + c.viewH / 2;
  }, DY);
  await pump(page, 10);
  const before = await page.evaluate(() => window.__dbg());
  await page.evaluate(() => { window.__swGame.input.keys.add('ControlLeft'); });
  await pump(page, 10);
  const after = await page.evaluate(() => window.__dbg());
  console.log('BEFORE', JSON.stringify(before, null, 1));
  console.log('AFTER ', JSON.stringify(after, null, 1));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

// BJ320 状态核查：钉位/门表/inTileRange/悬停链中间态
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj320-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj320', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
const st = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const TK = tilesMod.TILE_BY_KEY ?? {};
  const doorId = TK['door_closed'] ?? -1;
  const keys = Object.keys(TK).filter((k) => k.includes('door')).slice(0, 10);
  for (let x = 44; x <= 82; x++) for (let y = 112; y <= 134; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132, 1, 0, 0);
  for (let j = 0; j < 3; j++) st.setTileSilent(66, 128 + j, doorId, 0, j * 54);
  g.chunks.markDirtyArea(44, 112, 82, 134);
  const pl = g.player;
  pl.x = 61 * 16; pl.y = 132 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  const w00 = g.camera.screenToWorld(0, 0);
  const w10 = g.camera.screenToWorld(1, 0);
  const w01 = g.camera.screenToWorld(0, 1);
  const sx = w10[0] - w00[0], sy = w01[1] - w00[1];
  const wx = 66 * 16 + 8, wy = 129 * 16 + 8;
  const mx = Math.round((wx - w00[0]) / sx), my = Math.round((wy - w00[1]) / sy);
  g.input.mouseX = mx; g.input.mouseY = my;
  const [bwx, bwy] = g.camera.screenToWorld(mx, my);
  const tx = Math.floor(bwx / 16), ty = Math.floor(bwy / 16);
  // 悬停链中间态
  const tile = st.get(tx, ty);
  const sheet = (await import('/src/data/tiles.ts')).TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
  const gproto = Object.getPrototypeOf(g);
  const inRange = gproto.inTileRange.call(g, tx, ty);
  // 门表
  const { styleDropVidOfFrames } = await import('/src/render/TileStyleDrops.ts').catch(() => ({}));
  let doorVid = null, doorVidPath = '';
  try { doorVid = styleDropVidOfFrames(10, 0, 54); doorVidPath = 'TileStyleDrops'; } catch { /* */ }
  if (doorVid == null) {
    try {
      const m2 = await import('/src/world/TileStyleDrops.ts');
      doorVid = m2.styleDropVidOfFrames(10, 0, 54); doorVidPath = 'world/TileStyleDrops';
    } catch { /* */ }
  }
  // 跑一帧悬停看字段
  const p = g.player;
  p.cursorItemIconEnabled = false; p.cursorItemIconID = 0;
  try { gproto.tileInteractionsMouseOver.call(g, tx, ty, p); } catch (e) { return { err: String(e) }; }
  return {
    doorId, keys, mx, my, mapBack: { tx, ty }, tile, sheet, inRange,
    doorVid, doorVidPath,
    claim: { enabled: p.cursorItemIconEnabled, id: p.cursorItemIconID },
    playerPx: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
    reach: { x: g.tileReach ? g.tileReach(0) : null },
    mouseNow: { x: g.input.mouseX, y: g.input.mouseY },
    fullMapOpen: !!g.renderer?.fullMap?.open,
    paused: g.paused,
  };
});
console.log(JSON.stringify(st, null, 1));
await browser.close();
if (errs.length) { console.error('PAGEERRORS', errs.join('|')); process.exit(1); }
